'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

// Laporan baru hanya bulanan; default bulan lalu.
const defaultKey = () => {
  const d = new Date(todayIso());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

export default function ReportsClient({ user, sites, data, page }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const canCreate = ['HSE_SITE', 'HO_HSE'].includes(user.role);
  const queueLabel = ['PJO', 'PM'].includes(user.role) ? 'Perlu diperiksa' : user.role === 'HO_HSE' ? 'Perlu disahkan' : 'Draft & revisi';

  const setValues = (u) => setForm((prev) => (typeof u === 'function' ? u(prev) : u));

  return (
    <div className="stack">
      <Card title={<span>Laporan bulanan {data.period} · batas tanggal {data.deadline} ({formatDate(data.dueDate)})</span>}>
        {data.notReported.length === 0 ? (
          <span className="text-green">Semua site dalam cakupan sudah mengirim laporan bulanan.</span>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className={data.overdue ? 'text-red' : 'text-orange'} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
              <AlertTriangle size={16} /> {data.notReported.length} site belum mengirim laporan{data.overdue ? ' — melewati batas' : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{data.notReported.map((s) => <span key={s.id} className="chip">{s.code} — {s.name}</span>)}</div>
          </div>
        )}
      </Card>

      <FilterBar filters={[
        { name: 'queue', label: 'Antrian', type: 'select', options: [['1', queueLabel]], allLabel: 'Semua laporan' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'type', label: 'Jenis', type: 'select', options: ['HARIAN', 'MINGGUAN', 'BULANAN'] },
        { name: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'SUBMITTED', 'REVIEWED', 'REVISION', 'APPROVED'] },
        { name: 'period', label: 'Cek bulan', type: 'month' },
      ]}>
        {canCreate && <button className="btn btn-primary" onClick={() => setForm({ siteId: sites.filter((s) => !s.isHo).length === 1 ? sites.find((s) => !s.isHo).id : '', type: 'BULANAN', periodKey: defaultKey() })}><Plus size={16} /> Buat laporan</button>}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => router.push('/reports/' + r.id)} empty="Belum ada laporan."
          columns={[
            { key: 'site', label: 'Site', render: (r) => <strong>{r.site.code}</strong> },
            { key: 'type', label: 'Jenis', render: (r) => labelOf(r.type) },
            { key: 'period', label: 'Periode', render: (r) => (<div>{r.periodKey}<div className="muted">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</div></div>) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
            { key: 'v', label: 'Versi', num: true, render: (r) => r.version },
            { key: 'sub', label: 'Dikirim', render: (r) => formatDate(r.submittedAt) },
            { key: 'due', label: 'Batas', render: (r) => (r.dueDate ? <span className={r.status === 'DRAFT' && new Date() > new Date(r.dueDate) ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> : '-') },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Buat laporan HSE" subtitle="Ringkasan manpower, manhours, aktivitas dan kejadian diisi otomatis dari HSE Performance & Insiden.">
        {form && (
          <form onSubmit={async (e) => { e.preventDefault(); const r = await submit('/api/reports', { body: form }); if (r?.id) router.push('/reports/' + r.id); }}>
            <FormFields values={form} setValues={setValues} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: sites.filter((s) => !s.isHo && s.isActive).map((s) => [s.id, `${s.code} — ${s.name}`]), required: true },
              { name: 'type', label: 'Jenis', type: 'select', options: ['BULANAN'], required: true, noEmpty: true },
              { name: 'periodKey', label: 'Periode', type: 'month', required: true, hint: 'Bulan laporan.' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Buat draft</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
