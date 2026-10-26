'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, Check, X, IdCard } from 'lucide-react';
import { compressImage } from './ui';
import { coverCrop } from '@/lib/domain/camera-crop';

// Rasio kartu identitas ISO/IEC 7810 ID-1 (KTP): 85,6 × 54 mm.
const KTP_RATIO = 85.6 / 54;
const OUTPUT_WIDTH = 1600; // cukup untuk OCR, ukuran file tetap kecil

/**
 * Satu tombol "Foto KTP" → pilih Ambil foto (kamera dengan bingkai KTP) atau Pilih dari galeri/file.
 * onChange(file, original): `file` siap diunggah, `original` kualitas penuh (untuk OCR).
 */
export default function KtpCapture({ label = 'Foto KTP', required = false, accept = 'image/jpeg,image/png,image/webp', onChange, file }) {
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const nativeCameraRef = useRef(null);
  const wrapRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), []);

  const pick = (f, original) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f.type?.startsWith('image/') ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
    onChange(f, original);
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const fromInput = async (e) => {
    const raw = e.target.files[0];
    e.target.value = '';
    if (raw) pick(await compressImage(raw), raw);
  };

  const openCamera = () => {
    setMenu(false);
    // Kamera dalam halaman butuh HTTPS + getUserMedia; bila tidak ada, pakai kamera bawaan HP.
    if (navigator.mediaDevices?.getUserMedia) setCamera(true);
    else nativeCameraRef.current?.click();
  };

  return (
    <div className="form-group" ref={wrapRef} style={{ position: 'relative', gridColumn: '1 / -1' }}>
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
      <button type="button" className="btn btn-outline btn-block" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
        <IdCard size={17} aria-hidden /> {file ? 'Ganti foto KTP' : 'Unggah foto KTP'}
      </button>
      {menu && (
        <div className="source-menu" role="menu">
          <button type="button" role="menuitem" onClick={openCamera}><Camera size={17} aria-hidden /> Ambil foto dengan kamera</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); fileRef.current?.click(); }}><ImageIcon size={17} aria-hidden /> Pilih dari galeri / file</button>
        </div>
      )}
      <input ref={fileRef} type="file" hidden accept={accept} onChange={fromInput} />
      <input ref={nativeCameraRef} type="file" hidden accept="image/*" capture="environment" onChange={fromInput} />
      {file && preview && <img className="ktp-thumb" src={preview} alt="Pratinjau foto KTP" />}
      {file && !preview && <div className="form-hint">✓ {file.name}</div>}
      {!file && <div className="form-hint">Foto jelas, tidak buram, seluruh kartu terlihat, tanpa pantulan cahaya.</div>}
      {camera && (
        <KtpCamera
          onClose={() => setCamera(false)}
          onFallback={() => { setCamera(false); nativeCameraRef.current?.click(); }}
          onCapture={(captured) => { setCamera(false); pick(captured, captured); }}
        />
      )}
    </div>
  );
}

function KtpCamera({ onClose, onCapture, onFallback }) {
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null); // { file, url }
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('Kamera tidak dapat dibuka. Izinkan akses kamera di browser, atau gunakan kamera bawaan HP.'));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  // Potong tepat area bingkai: petakan posisi bingkai di layar ke piksel video (object-fit: cover).
  const capture = () => {
    const video = videoRef.current, frame = frameRef.current;
    if (!video?.videoWidth || !frame) return;
    // Sedikit ruang di luar bingkai agar tepi kartu tidak terpotong.
    const { sx, sy, sw, sh } = coverCrop(video.getBoundingClientRect(), frame.getBoundingClientRect(), video.videoWidth, video.videoHeight, 0.04);
    if (!sw || !sh) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(OUTPUT_WIDTH, Math.round(sw));
    canvas.height = Math.round(canvas.width * (sh / sw));
    canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `ktp-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setShot({ file, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="ktp-camera" role="dialog" aria-modal="true" aria-label="Foto KTP">
      {/* Video tetap terpasang saat meninjau hasil agar "Ulangi" langsung kembali ke kamera. */}
      {!error && <video ref={videoRef} className="ktp-camera-video" autoPlay playsInline muted />}
      {error ? (
        <div className="ktp-camera-error">
          <p>{error}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={onFallback}><Camera size={16} /> Kamera bawaan HP</button>
            <button type="button" className="btn btn-outline" onClick={onClose}>Batal</button>
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
          <div className="ktp-camera-overlay" aria-hidden>
            <div className="ktp-frame" ref={frameRef} style={{ aspectRatio: KTP_RATIO }}>
              <span className="ktp-corner tl" /><span className="ktp-corner tr" /><span className="ktp-corner bl" /><span className="ktp-corner br" />
              {/* Panduan tata letak KTP: kop provinsi, baris data di kiri, pas foto di kanan. */}
              <div className="ktp-guide-head" />
              <div className="ktp-guide-lines">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
              <div className="ktp-guide-photo" />
            </div>
            <p className="ktp-camera-hint">Posisikan KTP mendatar tepat di dalam bingkai</p>
          </div>
          <div className="ktp-camera-bar">
            <button type="button" className="ktp-cam-btn" onClick={onClose}><X size={20} /> Batal</button>
            <button type="button" className="ktp-shutter" onClick={capture} aria-label="Ambil foto" />
            <span className="ktp-cam-btn" style={{ visibility: 'hidden' }}><X size={20} /> Batal</span>
          </div>
        </>
      )}
    </div>
  );
}
