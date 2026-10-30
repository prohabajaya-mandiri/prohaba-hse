'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ListChecks, AlarmClock, ShieldCheck, CheckCheck } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { CAPA_SOURCES, CAPA_STATUSES, DUE_DAYS, RISK_LEVELS } from '@/lib/domain/field-safety';

export default function ActionsClient({ sites, data, others, page, canCreate }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const s = data.summary;

  const save = async (e) => {
    e.preventDefault();
    const r = await submit('/api/actions', { body: form });
    if (r?.id) router.push('/actions/' + r.id);
  };

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Belum ditutup" value={s.open} icon={ListChecks} tone="navy" href="/actions?status=OPEN" />
        <Kpi label="Lewat tenggat" value={s.late} icon={AlarmClock} tone={s.late ? 'red' : 'green'} href="/actions?late=1" />
        <Kpi label="Menunggu verifikasi" value={s.waiting} icon={ShieldCheck} tone="blue" href="/actions?status=DIAJUKAN_TUTUP" />
        <Kpi label="Ditutup 30 hari terakhir" value={s.closed30} icon={CheckCheck} tone="green" href="/actions?status=DITUTUP" />
      </div>

      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nomor / judul / PIC' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
        { name: 'status', label: 'Status', type: 'select', noAll: true, default: 'OPEN', options: [['OPEN', 'Belum ditutup'], ...CAPA_STATUSES.map((x) => [x, labelOf(x)]), ['ALL', 'Semua status']] },
        { name: 'risk', label: 'Risiko', type: 'select', options: RISK_LEVELS.map((x) => [x, labelOf(x)]) },
        { name: 'source', label: 'Sumber', type: 'select', options: CAPA_SOURCES.map((x) => [x, labelOf(x)]) },
      ]}>
        {canCreate && <button className="btn btn-primary" onClick={() => setForm({ siteId: sites.filter((x) => !x.isHo).length === 1 ? sites.find((x) => !x.isHo).id : '', sourceType: 'MANUAL', sourceRef: '', title: '', description: '', riskLevel: 'SEDANG', picName: '', dueDate: '' })}><Plus size={16} /> Tindakan manual</button>}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => router.push('/actions/' + r.id)} empty="Tidak ada tindakan korektif."
          columns={[
            { key: 'n', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.site.code}</div></div>) },
            { key: 't', label: 'Tindakan', render: (r) => (<div>{r.title}<div className="muted">{labelOf(r.sourceType)}{r.sourceRef ? ' · ' + r.sourceRef : ''}</div></div>) },
            { key: 'risk', label: 'Risiko', render: (r) => <Badge value={r.riskLevel} /> },
            { key: 'pic', label: 'PIC', render: (r) => r.picName },
            { key: 'due', label: 'Tenggat', render: (r) => (<div className={r.late ? 'text-red' : ''}>{formatDate(r.dueDate)}{r.late && <div style={{ fontSize: 12 }}>terlambat</div>}</div>) },
            { key: 'st', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Card title={`Tindakan terbuka di modul lain (${others.length})`} padding={0}>
        <div className="notice info" style={{ margin: 16 }}>Tindakan insiden dan temuan CSMS dikelola di modulnya masing-masing; daftar ini hanya rekap agar semua tunggakan terlihat di satu tempat.</div>
        <DataTable rows={others} rowKey={(r) => r.key} empty="Tidak ada tindakan terbuka di modul lain."
          columns={[
            { key: 'm', label: 'Modul', render: (r) => (<div>{r.module}<div className="muted">{r.site}</div></div>) },
            { key: 'ref', label: 'Referensi', render: (r) => <Link href={r.link}>{r.ref}</Link> },
            { key: 't', label: 'Tindakan', render: (r) => r.title },
            { key: 'pic', label: 'PIC', render: (r) => r.pic ?? '-' },
            { key: 'due', label: 'Tenggat', render: (r) => <span className={r.late ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
          ]} />
      </Card>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Tindakan korektif manual" subtitle="Untuk temuan audit, rapat, atau sumber lain. Hazard report & inspeksi membuat tindakan dari modulnya sendiri.">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: sites.filter((x) => x.isActive).map((x) => [x.id, `${x.code} — ${x.name}`]), required: true },
              { name: 'sourceType', label: 'Sumber', type: 'select', noEmpty: true, options: [['MANUAL', 'Manual'], ['AUDIT', 'Audit']] },
              { name: 'sourceRef', label: 'Referensi (opsional)', placeholder: 'mis. No. laporan audit' },
              { name: 'riskLevel', label: 'Tingkat risiko', type: 'select', noEmpty: true, options: RISK_LEVELS.map((x) => [x, labelOf(x)]), hint: `Tenggat bawaan: ${DUE_DAYS[form.riskLevel]} hari.` },
              { name: 'title', label: 'Tindakan yang harus dilakukan', required: true, span: true },
              { name: 'description', label: 'Uraian / temuan', type: 'textarea', span: true },
              { name: 'picName', label: 'PIC', required: true },
              { name: 'dueDate', label: 'Tenggat', type: 'date', hint: 'Kosongkan untuk tenggat bawaan sesuai risiko.' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
