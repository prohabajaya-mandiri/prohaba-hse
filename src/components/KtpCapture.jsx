'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, RotateCw, Check, X, IdCard } from 'lucide-react';
import { compressImage } from './ui';
import { coverCrop, coverFit, frameCrop } from '@/lib/domain/camera-crop';

// Rasio kartu identitas ISO/IEC 7810 ID-1 (KTP): 85,6 × 54 mm.
const KTP_RATIO = 85.6 / 54;
const OUTPUT_WIDTH = 1600; // cukup untuk OCR, ukuran file tetap kecil

/*
 * Alur foto KTP (pola e-KYC):
 * - Satu tombol. Di HP langsung membuka kamera dengan bingkai KTP; di laptop membuka pemilih file.
 * - Di layar kamera ada tombol "Galeri" untuk foto yang sudah ada. Kamera tetap terbuka di belakang
 *   pemilih foto: bila pemilih dibatalkan, pengguna kembali ke kamera (bukan ke form).
 * - Foto dari galeri/file (termasuk "Take Photo" bawaan iOS, yang tidak bisa dihilangkan dari
 *   menu sistem) selalu melewati langkah "Sesuaikan": digeser/di-zoom di bawah bingkai yang sama,
 *   sehingga hasil akhirnya selalu terpotong seukuran KTP.
 * onChange(file, original): `file` siap diunggah, `original` kualitas penuh (untuk OCR).
 */
export default function KtpCapture({ label = 'Foto KTP', required = false, accept = 'image/jpeg,image/png,image/webp', onChange, file }) {
  const [mode, setMode] = useState(null); // null | 'camera' | 'adjust'
  const [source, setSource] = useState(null); // object URL foto yang sedang disesuaikan
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const nativeCameraRef = useRef(null);
  const previewRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
  }, []);

  const pick = (f, original) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f.type?.startsWith('image/') ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
    onChange(f, original);
  };

  const setSourceUrl = (url) => {
    if (sourceRef.current && sourceRef.current !== url) URL.revokeObjectURL(sourceRef.current);
    sourceRef.current = url;
    setSource(url);
  };

  const start = () => {
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && navigator.mediaDevices?.getUserMedia) setMode('camera');
    else fileRef.current?.click();
  };

  const fromInput = async (e) => {
    const raw = e.target.files[0];
    e.target.value = '';
    if (!raw) return;
    // PDF (scan KTP, hanya di form internal) tidak perlu disesuaikan.
    if (!raw.type.startsWith('image/')) return pick(raw, raw);
    setSourceUrl(URL.createObjectURL(raw));
    setMode('adjust');
  };

  const close = () => {
    setMode(null);
    setSourceUrl(null);
  };

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
      <button type="button" className="btn btn-outline btn-block" onClick={start}>
        <IdCard size={17} aria-hidden /> {file ? 'Ganti foto KTP' : 'Foto KTP'}
      </button>
      <input ref={fileRef} type="file" hidden accept={accept} onChange={fromInput} />
      <input ref={nativeCameraRef} type="file" hidden accept="image/*" capture="environment" onChange={fromInput} />
      {file && preview && <img className="ktp-thumb" src={preview} alt="Pratinjau foto KTP" />}
      {file && !preview && <div className="form-hint">✓ {file.name}</div>}
      {!file && <div className="form-hint">Kamera akan terbuka dengan bingkai KTP. Foto yang sudah ada? Ketuk <strong>Galeri</strong> di layar kamera (di iPhone pilih <strong>Photo Library</strong>).</div>}
      {mode === 'camera' && (
        <KtpCamera
          onClose={close}
          onGallery={() => fileRef.current?.click()}
          onFallback={() => { setMode(null); nativeCameraRef.current?.click(); }}
          onCapture={(shot) => { close(); pick(shot, shot); }}
        />
      )}
      {mode === 'adjust' && source && (
        <KtpAdjust
          src={source}
          onRotate={setSourceUrl}
          onCancel={close}
          onFailed={async () => {
            // Format yang tidak bisa dibaca browser: kirim apa adanya, server yang memvalidasi.
            const raw = await fetch(source).then((r) => r.blob());
            close();
            pick(await compressImage(new File([raw], 'ktp', { type: raw.type })), raw);
          }}
          onDone={(cropped) => { close(); pick(cropped, cropped); }}
        />
      )}
    </div>
  );
}

/** Bingkai KTP + panduan tata letak (kop provinsi, baris data di kiri, pas foto di kanan). */
function KtpFrame({ frameRef, hint }) {
  return (
    <div className="ktp-camera-overlay" aria-hidden>
      <div className="ktp-frame" ref={frameRef} style={{ aspectRatio: KTP_RATIO }}>
        <span className="ktp-corner tl" /><span className="ktp-corner tr" /><span className="ktp-corner bl" /><span className="ktp-corner br" />
        <div className="ktp-guide-head" />
        <div className="ktp-guide-lines">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
        <div className="ktp-guide-photo" />
      </div>
      <p className="ktp-camera-hint">{hint}</p>
    </div>
  );
}

function useBodyLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && new File([blob], `ktp-${Date.now()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.92));

function KtpCamera({ onClose, onCapture, onFallback, onGallery }) {
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null); // { file, url }
  const [error, setError] = useState('');
  useBodyLock();

  useEffect(() => {
    let cancelled = false;
    const start = () => navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => !cancelled && setError('Kamera tidak dapat dibuka. Izinkan akses kamera di browser, pilih foto dari galeri, atau gunakan kamera bawaan HP.'));
    // Pemilih foto sistem (mis. "Take Photo" iOS) dapat menghentikan kamera halaman.
    // Saat pengguna kembali, nyalakan ulang bila aliran berhenti, atau lanjutkan video yang terjeda.
    const resume = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const tracks = streamRef.current?.getTracks() ?? [];
      if (tracks.length && tracks.every((t) => t.readyState === 'live')) videoRef.current?.play?.().catch(() => {});
      else if (streamRef.current) {
        tracks.forEach((t) => t.stop());
        streamRef.current = null;
        start();
      }
    };
    start();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  // Potong tepat area bingkai (video tampil dengan object-fit: cover), plus sedikit ruang di tepi.
  const capture = async () => {
    const video = videoRef.current, frame = frameRef.current;
    if (!video?.videoWidth || !frame) return;
    const { sx, sy, sw, sh } = coverCrop(video.getBoundingClientRect(), frame.getBoundingClientRect(), video.videoWidth, video.videoHeight, 0.04);
    if (!sw || !sh) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(OUTPUT_WIDTH, Math.round(sw));
    canvas.height = Math.round(canvas.width * (sh / sw));
    canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const file = await toJpeg(canvas);
    if (file) setShot({ file, url: URL.createObjectURL(file) });
  };

  return (
    <div className="ktp-camera" role="dialog" aria-modal="true" aria-label="Foto KTP">
      {/* Video tetap terpasang saat meninjau hasil agar "Ulangi" langsung kembali ke kamera. */}
      {!error && <video ref={videoRef} className="ktp-camera-video" autoPlay playsInline muted />}
      {error ? (
        <div className="ktp-camera-error">
          <p>{error}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={onGallery}><ImageIcon size={16} /> Pilih dari galeri / file</button>
            <button type="button" className="btn btn-outline" style={{ color: '#fff' }} onClick={onFallback}><Camera size={16} /> Kamera bawaan HP</button>
            <button type="button" className="btn btn-ghost" style={{ color: '#fff' }} onClick={onClose}>Batal</button>
          </div>
        </div>
      ) : shot ? (
        <>
          <div className="ktp-camera-review">
            <img src={shot.url} alt="Hasil foto KTP" />
            <p>Pastikan seluruh tulisan terbaca jelas dan tidak silau.</p>
          </div>
          <div className="ktp-camera-bar">
            <button type="button" className="ktp-cam-btn" onClick={() => setShot(null)}><RotateCcw size={20} /> Ulangi</button>
            <button type="button" className="ktp-cam-btn primary" onClick={() => onCapture(shot.file)}><Check size={20} /> Gunakan foto</button>
          </div>
        </>
      ) : (
        <>
          <KtpFrame frameRef={frameRef} hint="Posisikan KTP mendatar tepat di dalam bingkai, lalu ketuk tombol bulat" />
          <button type="button" className="ktp-cam-close" onClick={onClose} aria-label="Tutup kamera"><X size={22} /></button>
          <div className="ktp-camera-bar">
            <button type="button" className="ktp-cam-btn" onClick={onGallery}><ImageIcon size={20} /> Galeri</button>
            <button type="button" className="ktp-shutter" onClick={capture} aria-label="Ambil foto" />
            <span className="ktp-cam-btn" style={{ visibility: 'hidden' }} aria-hidden><ImageIcon size={20} /> Galeri</span>
          </div>
        </>
      )}
    </div>
  );
}

const MIN_ZOOM = 0.5, MAX_ZOOM = 6; // relatif terhadap skala awal (gambar menutupi bingkai)

function KtpAdjust({ src, onCancel, onDone, onRotate, onFailed }) {
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const [view, setView] = useState(null); // { scale, imgLeft, imgTop, base, iw, ih }
  const [busy, setBusy] = useState(false);
  useBodyLock();

  const frameRect = () => {
    const s = stageRef.current.getBoundingClientRect(), f = frameRef.current.getBoundingClientRect();
    return { left: f.left - s.left, top: f.top - s.top, width: f.width, height: f.height };
  };

  const onLoad = () => {
    const img = imgRef.current;
    const fit = coverFit(frameRect(), img.naturalWidth, img.naturalHeight);
    setView({ ...fit, base: fit.scale, iw: img.naturalWidth, ih: img.naturalHeight });
  };

  // Zoom dengan titik (cx, cy) tetap di tempat.
  const zoomAt = (v, cx, cy, factor) => {
    const scale = Math.min(v.base * MAX_ZOOM, Math.max(v.base * MIN_ZOOM, v.scale * factor));
    const f = scale / v.scale;
    return { ...v, scale, imgLeft: cx - (cx - v.imgLeft) * f, imgTop: cy - (cy - v.imgTop) * f };
  };
  const local = (e) => {
    const s = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - s.left, y: e.clientY - s.top };
  };

  const onPointerDown = (e) => {
    stageRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  };
  const onPointerMove = (e) => {
    const map = pointers.current;
    if (!map.has(e.pointerId)) return;
    const before = [...map.values()].map((p) => ({ ...p }));
    map.set(e.pointerId, local(e));
    const after = [...map.values()];
    if (after.length === 1) {
      const dx = after[0].x - before[0].x, dy = after[0].y - before[0].y;
      setView((v) => v && { ...v, imgLeft: v.imgLeft + dx, imgTop: v.imgTop + dy });
    } else if (after.length >= 2) {
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const m0 = mid(before[0], before[1]), m1 = mid(after[0], after[1]);
      const factor = dist(after[0], after[1]) / dist(before[0], before[1]);
      setView((v) => v && zoomAt({ ...v, imgLeft: v.imgLeft + m1.x - m0.x, imgTop: v.imgTop + m1.y - m0.y }, m1.x, m1.y, factor));
    }
  };
  const onPointerUp = (e) => pointers.current.delete(e.pointerId);
  const onWheel = (e) => {
    const p = local(e);
    setView((v) => v && zoomAt(v, p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1));
  };
  const onSlider = (e) => {
    const f = frameRect();
    const target = Number(e.target.value) / 100;
    setView((v) => v && zoomAt(v, f.left + f.width / 2, f.top + f.height / 2, (target * v.base) / v.scale));
  };

  // Putar 90° searah jarum jam (foto galeri sering tersimpan tegak), lalu mulai ulang dari bingkai penuh.
  const rotate = async () => {
    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const g = canvas.getContext('2d');
    g.translate(canvas.width, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(img, 0, 0);
    const file = await toJpeg(canvas);
    if (file) {
      setView(null);
      onRotate(URL.createObjectURL(file));
    }
  };

  const done = async () => {
    setBusy(true);
    const frame = frameRect();
    const outW = Math.round(Math.min(OUTPUT_WIDTH, Math.max(800, frame.width / view.scale)));
    const c = frameCrop({ frame, imgLeft: view.imgLeft, imgTop: view.imgTop, scale: view.scale, iw: view.iw, ih: view.ih }, outW);
    const canvas = document.createElement('canvas');
    canvas.width = c.outW;
    canvas.height = c.outH;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.outW, c.outH);
    if (c.sw && c.sh) g.drawImage(imgRef.current, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy, c.dw, c.dh);
    const file = await toJpeg(canvas);
    setBusy(false);
    if (file) onDone(file);
  };

  return (
    <div className="ktp-camera" role="dialog" aria-modal="true" aria-label="Sesuaikan foto KTP">
      <div
        ref={stageRef}
        className="ktp-adjust-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* Gambar lokal pilihan pengguna (object URL), bukan dari server. */}
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={onLoad}
          onError={onFailed}
          className="ktp-adjust-img"
          style={view ? { width: view.iw, height: view.ih, transform: `translate(${view.imgLeft}px, ${view.imgTop}px) scale(${view.scale})` } : { visibility: 'hidden' }}
        />
        <KtpFrame frameRef={frameRef} hint="Geser & cubit (atau zoom) agar KTP pas di dalam bingkai" />
      </div>
      <div className="ktp-adjust-zoom">
        <label htmlFor="ktp-zoom">Zoom</label>
        <input id="ktp-zoom" type="range" min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step={5} value={view ? Math.round((view.scale / view.base) * 100) : 100} onChange={onSlider} disabled={!view} />
      </div>
      <div className="ktp-camera-bar">
        <button type="button" className="ktp-cam-btn" onClick={onCancel}><X size={20} /> Batal</button>
        <button type="button" className="ktp-cam-btn" onClick={rotate} disabled={!view}><RotateCw size={20} /> Putar</button>
        <button type="button" className="ktp-cam-btn primary" onClick={done} disabled={!view || busy}><Check size={20} /> Gunakan</button>
      </div>
    </div>
  );
}
