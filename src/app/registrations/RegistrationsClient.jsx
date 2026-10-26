'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Download, QrCode } from 'lucide-react';
import { Badge, Card, DataTable } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const TABS = [['MENUNGGU', 'Menunggu verifikasi'], ['DISETUJUI', 'Disetujui'], ['DITOLAK', 'Ditolak']];

export default function RegistrationsClient({ data, link, qr }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const pending = data.status === 'MENUNGGU';

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="stack">
      <Card title="Bagikan form pendaftaran" actions={<span className="muted"><QrCode size={14} /> Tempel QR di mess/kantor Balikpapan</span>}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* SVG dibuat server dari link aplikasi sendiri. */}
          <div style={{ width: 200, height: 200, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="stack" style={{ flex: 1, minWidth: 240 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="reg-link">Link form (tanpa login)</label>
              <input id="reg-link" className="form-input" value={link} readOnly onFocus={(e) => e.target.select()} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={copy}><Copy size={15} /> {copied ? 'Tersalin' : 'Salin link'}</button>
              <a className="btn btn-outline btn-sm" download="QR-Pendaftaran-Pegawai-Baru.svg" href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr)}><Download size={15} /> Unduh QR</a>
            </div>
            <div className="muted">Isian pegawai masuk ke daftar di bawah dan baru menjadi data karyawan setelah disetujui HO HSE / HRD.</div>
          </div>
        </div>
      </Card>

      <div className="tabs-bar">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/registrations?status=${k}`} className={data.status === k ? 'active' : ''}>
            {l}{data.counts[k] ? ` (${data.counts[k]})` : ''}
          </Link>
        ))}
      </div>

      <div className="card">
        <DataTable
          rows={data.rows}
          empty={pending ? 'Tidak ada pendaftaran yang menunggu verifikasi.' : 'Belum ada data.'}
          onRowClick={(r) => router.push('/registrations/' + r.id)}
          columns={[
            { key: 'number', label: 'No', render: (r) => <strong>{r.number}</strong> },
            { key: 'name', label: 'Nama', render: (r) => (<div><strong>{r.name}</strong><div className="muted">NIK {r.nik} · {r.age ?? '-'} th</div></div>) },
            { key: 'category', label: 'Kategori', render: (r) => labelOf(r.category) },
            { key: 'position', label: 'Jabatan' },
            { key: 'site', label: 'Tujuan', render: (r) => r.site.code },
            { key: 'arrival', label: 'Tiba', render: (r) => formatDate(r.arrivalDate) },
            { key: 'mcu', label: 'Rencana MCU', render: (r) => formatDate(r.mcuDate) },
            pending
              ? { key: 'since', label: 'Masuk', render: (r) => new Date(r.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) }
              : { key: 'decided', label: 'Diputuskan', render: (r) => (<div><Badge value={r.status} /><div className="muted">{r.decidedByName} · {formatDate(r.decidedAt)}</div></div>) },
          ]}
        />
      </div>
    </div>
  );
}
