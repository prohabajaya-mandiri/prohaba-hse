'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CheckCircle2, Camera, Send } from 'lucide-react';
import { compressImage } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { CATEGORIES, CATEGORY_LABELS, nikInfo } from '@/lib/domain/personnel';
import { ageOn, arrivalIso, mcuIso } from '@/lib/domain/registration';

const EMPTY = {
  name: '', nik: '', birthDate: '', category: '', position: '', siteId: '', phoneWa: '', ktpAddress: '',
  emergencyName: '', emergencyPhone: '', emergencyRelation: '', consent: false, website: '',
};

export default function DaftarClient({ sites }) {
  const [v, setV] = useState(EMPTY);
  const [ktp, setKtp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const arrival = arrivalIso();
  const age = ageOn(v.birthDate);
  const nik = nikInfo(v.nik);

  // NIK memuat tanggal lahir: isi otomatis bila tanggal lahir masih kosong.
  const onNik = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 16);
    const info = nikInfo(value);
    setV((s) => ({ ...s, nik: value, birthDate: s.birthDate || (info?.birthDate ?? '') }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!ktp) return setError('Foto KTP wajib diunggah.');
    setBusy(true);
    try {
      const form = new FormData();
      for (const [k, val] of Object.entries(v)) form.set(k, String(val));
      form.set('ktp', ktp);
      const res = await fetch('/api/public/registrations', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Pendaftaran gagal. Silakan coba lagi.');
      setDone(data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-card register-card">
        <div className="login-logo">
          <Image src="/brand/prohaba-hse-logo.png" alt="Prohaba Jaya Mandiri — Utamakan Keselamatan dan Kesehatan Kerja" width={206} height={96} priority />
        </div>
        <h1 className="login-title">Pendaftaran Pegawai Baru</h1>
        {done ? (
          <div className="stack" style={{ marginTop: 20 }}>
            <div className="alert alert-success" role="status" style={{ display: 'flex', gap: 10 }}>
              <CheckCircle2 size={20} aria-hidden />
              <div>
                <strong>Pendaftaran diterima{done.number ? ` — ${done.number}` : ''}.</strong>
                <div>Data Anda sedang diverifikasi HSE/HRD. Simpan nomor pendaftaran ini.</div>
              </div>
            </div>
            {done.number && (
              <dl className="detail-grid">
                <div><dt>Nama</dt><dd>{done.name}</dd></div>
                <div><dt>Tujuan site</dt><dd>{done.site}</dd></div>
                <div><dt>Tanggal tiba di Balikpapan</dt><dd>{formatDate(done.arrivalDate)}</dd></div>
                <div><dt>Rencana MCU</dt><dd>{formatDate(done.mcuDate)}</dd></div>
              </dl>
            )}
            <p className="muted">Jadwal & klinik MCU final akan dikonfirmasi HSE melalui WhatsApp.</p>
            <button type="button" className="btn btn-outline btn-block" onClick={() => { setDone(null); setV(EMPTY); setKtp(null); }}>Isi pendaftaran lain</button>
          </div>
        ) : (
          <>
            <p className="login-desc">Isi sesuai KTP. Data diverifikasi HSE/HRD sebelum masuk data karyawan.</p>
            {error && <div role="alert" className="alert alert-danger" style={{ marginBottom: 18 }}>{error}</div>}
            <form onSubmit={submit} className="login-form">
              <div className="form-group">
                <label className="form-label required" htmlFor="r-name">Nama lengkap (sesuai KTP)</label>
                <input id="r-name" className="form-input" value={v.name} onChange={set('name')} required maxLength={150} autoComplete="name" />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-nik">NIK</label>
                <input id="r-nik" className="form-input" value={v.nik} onChange={onNik} required inputMode="numeric" pattern="\d{16}" title="NIK 16 digit angka" placeholder="16 digit" />
                {v.nik.length === 16 && !nik && <div className="form-hint text-red">NIK tidak dikenali — periksa kembali.</div>}
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="r-birth">Tanggal lahir</label>
                  <input id="r-birth" type="date" className="form-input" value={v.birthDate} onChange={set('birthDate')} required max={arrival} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="r-age">Umur</label>
                  <input id="r-age" className="form-input" value={age === null ? '' : `${age} tahun`} readOnly tabIndex={-1} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-category">Kategori</label>
                <select id="r-category" className="form-select" value={v.category} onChange={set('category')} required>
                  <option value="">— Pilih —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-position">Jabatan</label>
                <input id="r-position" className="form-input" value={v.position} onChange={set('position')} required maxLength={100} placeholder="mis. Operator Excavator, Helper, Admin" />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-site">Tujuan site</label>
                <select id="r-site" className="form-select" value={v.siteId} onChange={set('siteId')} required>
                  <option value="">— Pilih —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="r-arrival">Tanggal tiba di Balikpapan</label>
                  <input id="r-arrival" className="form-input" value={formatDate(arrival)} readOnly tabIndex={-1} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="r-mcu">Rencana MCU</label>
                  <input id="r-mcu" className="form-input" value={formatDate(mcuIso(arrival))} readOnly tabIndex={-1} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-wa">No WhatsApp</label>
                <input id="r-wa" type="tel" className="form-input" value={v.phoneWa} onChange={set('phoneWa')} required maxLength={30} inputMode="tel" placeholder="08xxxxxxxxxx" autoComplete="tel" />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-address">Alamat sesuai KTP</label>
                <textarea id="r-address" className="form-input" rows={3} value={v.ktpAddress} onChange={set('ktpAddress')} required maxLength={500} />
              </div>
              <div className="form-group">
                <label className="form-label required">Foto KTP</label>
                <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                  <Camera size={16} aria-hidden /> {ktp ? 'Ganti foto KTP' : 'Ambil / pilih foto KTP'}
                  <input type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment"
                    onChange={async (e) => { const f = e.target.files[0]; if (f) setKtp(await compressImage(f)); }} />
                </label>
                <div className="form-hint">{ktp ? ktp.name : 'Foto jelas, tidak buram, seluruh kartu terlihat.'}</div>
              </div>
              <div className="section-title" style={{ marginBottom: 0 }}>Kontak darurat (keluarga)</div>
              <div className="form-group">
                <label className="form-label required" htmlFor="r-ename">Nama</label>
                <input id="r-ename" className="form-input" value={v.emergencyName} onChange={set('emergencyName')} required maxLength={120} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="r-erel">Hubungan</label>
                  <input id="r-erel" className="form-input" value={v.emergencyRelation} onChange={set('emergencyRelation')} maxLength={60} placeholder="Istri, Ayah, …" />
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="r-ephone">No HP</label>
                  <input id="r-ephone" type="tel" className="form-input" value={v.emergencyPhone} onChange={set('emergencyPhone')} required maxLength={30} inputMode="tel" />
                </div>
              </div>
              {/* Honeypot anti-bot: tidak terlihat oleh manusia. */}
              <input type="text" name="website" value={v.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />
              <label className="check-row">
                <input type="checkbox" checked={v.consent} onChange={set('consent')} required />
                <span>Saya menyatakan data di atas benar dan menyetujui data pribadi saya diproses PT Prohaba Jaya Mandiri untuk keperluan kepegawaian dan K3.</span>
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? <><span className="spinner" aria-hidden /> Mengirim…</> : <><Send size={16} aria-hidden /> Kirim pendaftaran</>}
              </button>
            </form>
          </>
        )}
        <p className="login-foot">© {new Date().getFullYear()} PT. Prohaba Jaya Mandiri</p>
      </div>
    </main>
  );
}
