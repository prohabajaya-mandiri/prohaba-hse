'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, XCircle, Check, X, MessageCircle, ArrowLeft } from 'lucide-react';
import { Badge, Card, FormFields, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/domain/personnel';

const ICON = { ok: [CheckCircle2, 'var(--green-600)'], warn: [AlertTriangle, 'var(--yellow-700)'], danger: [XCircle, 'var(--red-600)'] };

function waLink(number, text) {
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export default function RegistrationReview({ reg }) {
  const { submit, busy } = useSubmit();
  const { showPrompt } = useDialog();
  const [result, setResult] = useState(null);
  const [v, setV] = useState({
    name: reg.name, category: reg.category, position: reg.position, siteId: reg.siteId, birthDate: iso(reg.birthDate),
    phoneWa: reg.phoneWa, mcuDate: iso(reg.mcuDate), clinic: reg.defaultClinic, note: '',
  });
  const pending = reg.status === 'MENUNGGU' && !result;
  const blocked = reg.existing && !reg.existing.isFormer;
  const item = (label, value) => (<div><dt>{label}</dt><dd>{value || '-'}</dd></div>);

  const approve = async (e) => {
    e.preventDefault();
    const body = { ...v };
    if (!body.note) delete body.note;
    const r = await submit(`/api/registrations/${reg.id}/approve`, { body, success: null });
    if (r) setResult({ ...r, status: 'DISETUJUI' });
  };
  const reject = async () => {
    const note = await showPrompt('Tuliskan alasan penolakan (tercatat di riwayat keputusan).', 'Tolak pendaftaran');
    if (!note) return;
    const r = await submit(`/api/registrations/${reg.id}/reject`, { body: { note }, success: 'Pendaftaran ditolak.' });
    if (r) setResult({ status: 'DITOLAK' });
  };

  const mcuMessage = (r) => `Halo ${r.name}, pendaftaran Anda di PT Prohaba Jaya Mandiri telah diverifikasi (site ${r.site}). Jadwal MCU Pre-Employment: ${formatDate(r.mcuDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} di ${r.clinic}. Mohon datang tepat waktu dan membawa KTP asli. Terima kasih.`;

  return (
    <div className="stack">
      <div className="toolbar">
        <Link href="/registrations" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Daftar pendaftaran</Link>
        <Badge value={result?.status ?? reg.status} />
        <span className="chip">{labelOf(reg.category)}</span>
        <span className="chip">{reg.site.code} — {reg.site.name}</span>
      </div>

      {result?.status === 'DISETUJUI' && (
        <div className="alert alert-success" role="status">
          <strong>Disetujui.</strong> {result.reactivated ? 'Profil mantan personel diaktifkan kembali' : 'Personel baru dibuat'} ({result.code}) dengan status kerja MCU, penempatan di {result.site}, dan rencana MCU {formatDate(result.mcuDate)}.
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Link className="btn btn-primary btn-sm" href={'/personnel/' + result.personnelId}>Buka data karyawan</Link>
            {result.wa && <a className="btn btn-outline btn-sm" href={waLink(result.wa, mcuMessage(result))} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Kirim jadwal MCU via WA</a>}
          </div>
        </div>
      )}
      {!pending && !result && (
        <div className={`alert ${reg.status === 'DISETUJUI' ? 'alert-success' : 'alert-danger'}`}>
          {labelOf(reg.status)} oleh {reg.decidedByName} pada {new Date(reg.decidedAt).toLocaleString('id-ID')}.{reg.decisionNote ? ` Catatan: ${reg.decisionNote}` : ''}
          {reg.personnelId && <> <Link href={'/personnel/' + reg.personnelId}>Buka data karyawan</Link></>}
        </div>
      )}

      <div className="grid-2">
        <Card title="Foto KTP">
          {reg.ktpFileId
            ? <a href={`/api/files/${reg.ktpFileId}?inline=1`} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
                {/* File privat terenkripsi, dilayani lewat API berotorisasi. */}
                <img src={`/api/files/${reg.ktpFileId}?inline=1`} alt={`KTP ${reg.name}`} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--gray-200)' }} />
              </a>
            : <div className="muted">Tidak ada foto KTP.</div>}
        </Card>
        <Card title="Isian pegawai">
          <dl className="detail-grid">
            {item('Nama', reg.name)}
            {item('NIK', reg.nik)}
            {item('Tanggal lahir · umur', `${formatDate(reg.birthDate)} · ${reg.age ?? '-'} tahun`)}
            {item('Jenis kelamin (dari NIK)', reg.gender === 'L' ? 'Laki-laki' : reg.gender === 'P' ? 'Perempuan' : null)}
            {item('Kategori', CATEGORY_LABELS[reg.category])}
            {item('Jabatan', reg.position)}
            {item('Tujuan site', `${reg.site.code} — ${reg.site.name}`)}
            {item('Tiba di Balikpapan', formatDate(reg.arrivalDate))}
            {item('Rencana MCU', formatDate(reg.mcuDate))}
            {item('No WhatsApp', reg.phoneWa)}
            {item('Alamat KTP', reg.ktpAddress)}
            {item('Kontak darurat', [reg.emergencyName, reg.emergencyRelation, reg.emergencyPhone].filter(Boolean).join(' · '))}
          </dl>
        </Card>
      </div>

      <Card title="Pemeriksaan otomatis">
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
          {reg.checks.map((c) => {
            const [Icon, color] = ICON[c.level];
            return <li key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><Icon size={17} color={color} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{c.label}</span></li>;
          })}
        </ul>
        {reg.existing && <div style={{ marginTop: 10 }}><Link href={'/personnel/' + reg.existing.id}>Lihat profil {reg.existing.name} ({reg.existing.code})</Link></div>}
      </Card>

      {pending && (
        <Card title="Keputusan">
          <form onSubmit={approve}>
            <div className="muted" style={{ marginBottom: 12 }}>Koreksi isian bila perlu sebelum menyetujui. Tanggal mulai kerja = tanggal tiba ({formatDate(reg.arrivalDate)}).</div>
            <FormFields values={v} setValues={setV} fields={[
              { name: 'name', label: 'Nama lengkap', required: true },
              { name: 'birthDate', label: 'Tanggal lahir', type: 'date', required: true },
              { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]), required: true, noEmpty: true },
              { name: 'position', label: 'Jabatan', required: true },
              { name: 'siteId', label: 'Site', type: 'select', options: reg.sites.map((s) => [s.id, `${s.code} — ${s.name}`]), required: true, noEmpty: true },
              { name: 'phoneWa', label: 'No WhatsApp', type: 'tel', required: true },
              { name: 'mcuDate', label: 'Tanggal MCU', type: 'date', required: true, min: iso(reg.arrivalDate), hint: 'Default H+1 dari tanggal tiba; geser bila klinik tutup.' },
              { name: 'clinic', label: 'Klinik MCU', required: true, hint: 'Isian awal = klinik MCU Pre-Employment terakhir.' },
              { name: 'note', label: 'Catatan (opsional)', type: 'textarea', span: true },
            ]} />
            {blocked && <div className="alert alert-danger" style={{ marginTop: 12 }}>NIK ini milik personel aktif — pendaftaran tidak dapat disetujui. Tolak dengan alasan duplikat.</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || blocked}><Check size={16} /> {reg.existing?.isFormer ? 'Setujui & aktifkan profil lama' : 'Setujui & buat data karyawan'}</button>
              <button type="button" className="btn btn-outline text-red" disabled={busy} onClick={reject}><X size={16} /> Tolak</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
