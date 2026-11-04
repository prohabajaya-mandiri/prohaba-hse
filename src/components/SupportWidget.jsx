'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Camera, ImagePlus, Send, X } from 'lucide-react';
import { Badge, FileLinks, Modal, useSubmit } from './ui';
import { useDialog } from './DialogProvider';
import { apiFetch } from '@/lib/client-api';
import { SUPPORT_CATEGORIES } from '@/lib/domain/support';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const MAX_IMAGES = 3;
const MAX_SIDE = 1600;
const EMPTY = { category: 'KENDALA_APLIKASI', message: '' };

const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));

// Gambar dikecilkan di browser agar unggahan tetap di bawah batas 4 MB.
function drawScaled(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  return drawScaled(bitmap, bitmap.width, bitmap.height);
}

async function captureScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return await drawScaled(video, video.videoWidth, video.videoHeight);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export default function SupportWidget({ open, setOpen }) {
  const pathname = usePathname();
  const { submit, busy } = useSubmit();
  const { showAlert } = useDialog();
  const [tab, setTab] = useState('new');
  const [form, setForm] = useState(EMPTY);
  const [images, setImages] = useState([]);
  const [tickets, setTickets] = useState(null);
  const [replies, setReplies] = useState({});

  const addBlob = (blob) => {
    if (!blob) return;
    setImages((list) => (list.length >= MAX_IMAGES ? list : [...list, { blob, url: URL.createObjectURL(blob) }]));
  };

  const addFiles = async (files) => {
    try {
      for (const file of files) addBlob(await shrinkImage(file));
    } catch {
      await showAlert('Gambar tidak dapat dibaca. Gunakan file JPG, PNG, atau WEBP.', 'Gagal');
    }
  };

  // Panel disembunyikan selama pengambilan agar tidak ikut tertangkap.
  const takeScreenshot = async () => {
    setOpen(false);
    try {
      addBlob(await captureScreen());
    } catch (e) {
      if (e?.name !== 'NotAllowedError') await showAlert('Peramban ini tidak mendukung tangkap layar. Silakan pilih file gambar.', 'Gagal');
    }
    setOpen(true);
  };

  const onPaste = (e) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) addFiles(files);
  };

  const loadTickets = async () => {
    setTab('mine');
    try {
      setTickets(await (await apiFetch('/api/support')).json());
    } catch (e) {
      await showAlert(e.message, 'Gagal');
    }
  };

  const send = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...form, page: pathname }));
    images.forEach((img, i) => fd.append('files', new File([img.blob], `aduan-${i + 1}.jpg`, { type: 'image/jpeg' })));
    const r = await submit('/api/support', { form: fd, refresh: false, success: 'Aduan terkirim ke HO HSE.' });
    if (r) {
      images.forEach((img) => URL.revokeObjectURL(img.url));
      setImages([]);
      setForm(EMPTY);
      loadTickets();
    }
  };

  const sendReply = async (t) => {
    const message = replies[t.id]?.trim();
    if (!message || !(await submit(`/api/support/${t.id}`, { body: { message }, refresh: false }))) return;
    setReplies({ ...replies, [t.id]: '' });
    loadTickets();
  };

  return (
    <>
      <Modal open={open} onClose={() => setOpen(false)} title="Aduan & Bantuan" subtitle="Sampaikan kendala, laporan, atau informasi penting kepada HO HSE.">
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={`tab ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>Kirim aduan</button>
          <button type="button" className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={loadTickets}>Aduan saya</button>
        </div>

        {tab === 'new' && (
          <form onSubmit={send} className="stack" onPaste={onPaste}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required" htmlFor="support-category">Kategori</label>
              <select id="support-category" className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{labelOf(c)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required" htmlFor="support-message">Pesan</label>
              <textarea id="support-message" className="form-input" rows={4} required maxLength={3000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tuliskan kendala atau informasi yang ingin disampaikan" />
            </div>
            <div>
              <div className="support-attach">
                <button type="button" className="btn btn-outline btn-sm" disabled={images.length >= MAX_IMAGES} onClick={takeScreenshot}><Camera size={15} /> Tangkap layar</button>
                <label className={`btn btn-outline btn-sm ${images.length >= MAX_IMAGES ? 'disabled' : ''}`}>
                  <ImagePlus size={15} /> Pilih gambar
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={images.length >= MAX_IMAGES} onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
                </label>
              </div>
              <div className="form-hint">Maksimal {MAX_IMAGES} gambar. Screenshot juga bisa ditempel dengan Ctrl+V.</div>
              {images.length > 0 && (
                <div className="support-thumbs">
                  {images.map((img) => (
                    <span key={img.url}>
                      <img src={img.url} alt="Lampiran aduan" />
                      <button type="button" aria-label="Hapus gambar" onClick={() => setImages(images.filter((x) => x !== img))}><X size={13} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div><button className="btn btn-primary" disabled={busy}><Send size={15} /> Kirim aduan</button></div>
          </form>
        )}

        {tab === 'mine' && (
          <div className="stack">
            {tickets === null && <div className="muted">Memuat…</div>}
            {tickets?.length === 0 && <div className="muted">Belum ada aduan.</div>}
            {tickets?.map((t) => (
              <div key={t.id} className="support-ticket">
                <div className="support-ticket-head"><strong>{t.number}</strong> <Badge value={t.status} /> <span className="muted">{labelOf(t.category)} · {formatDate(t.createdAt)}</span></div>
                <p>{t.message}</p>
                {t.files.length > 0 && <FileLinks files={t.files} />}
                {t.replies.map((r) => <div key={r.id} className={`support-reply ${r.fromHo ? 'ho' : ''}`}><strong>{r.authorName}</strong> {r.message}</div>)}
                {t.status !== 'SELESAI' && (
                  <div className="support-reply-form">
                    <input className="form-input" placeholder="Tulis balasan" maxLength={3000} value={replies[t.id] ?? ''} onChange={(e) => setReplies({ ...replies, [t.id]: e.target.value })} aria-label={`Balas aduan ${t.number}`} />
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => sendReply(t)}>Kirim</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
