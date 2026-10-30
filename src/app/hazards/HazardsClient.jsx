'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, TriangleAlert, Flame, CalendarRange, ListPlus, CheckCheck } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { DUE_DAYS, HAZARD_CATEGORIES, HAZARD_STATUSES, HAZARD_TYPES, LIKELIHOOD, RISK_LEVELS, riskLevel, SEVERITY } from '@/lib/domain/field-safety';

const time = (d) => new Date(d).toISOString().slice(11, 16);
const nowTime = () => new Date().toTimeString().slice(0, 5);

function RiskPreview({ l, s }) {
  if (!l || !s) return null;
  const level = riskLevel(l, s);
  return <div className="notice info" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>Tingkat risiko: <Badge value={level} /> <span className="muted">skor {l * s} · tindakan korektif bawaan {DUE_DAYS[level]} hari</span></div>;
}

export default function HazardsClient({ user, sites, data, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showPrompt } = useDialog();
  const [form, setForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [follow, setFollow] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);
  const s = data.summary;
  const canClose = ['HSE_SITE', 'HO_HSE'].includes(user.role);

  const open = () => {
    setFiles([]);
    setForm({ siteId: sites.filter((x) => !x.isHo).length === 1 ? sites.find((x) => !x.isHo).id : '', date: todayIso(), time: nowTime(), location: '', type: 'UNSAFE_CONDITION', category: '', description: '', immediateAction: '', likelihood: '3', severity: '3', reporterName: '', fixedOnSpot: false, picName: '', capaTitle: '', dueDate: '' });
  };
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('data', JSON.stringify(form));
    files.forEach((f) => fd.append('files', f));
    const r = await submit('/api/hazards', { form: fd });
    if (r?.id) setForm(null);
  };
  const saveFollow = async (e) => {
    e.preventDefault();
    const { id, ...body } = follow;
    if (await submit(`/api/hazards/${id}/actions`, { body, success: 'Tindakan korektif dibuat.' })) setFollow(null);
  };
  const close = async (r) => {
    const note = await showPrompt('Alasan menutup tanpa tindakan korektif (mis. sudah aman, duplikat)', 'Tutup hazard report');
    if (note?.trim() && (await submit(`/api/hazards/${r.id}/close`, { body: { note } }))) setDetailId(null);
  };

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Belum selesai" value={s.open} icon={TriangleAlert} tone="orange" href="/hazards?status=BARU" />
        <Kpi label="Risiko tinggi/ekstrem terbuka" value={s.high} icon={Flame} tone={s.high ? 'red' : 'green'} href="/hazards?risk=TINGGI" />
        <Kpi label="Dilaporkan 30 hari terakhir" value={s.month} icon={CalendarRange} tone="navy" hint="Makin banyak laporan = budaya melapor makin baik" />
      </div>

      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nomor / lokasi / uraian' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
        { name: 'type', label: 'Jenis', type: 'select', options: HAZARD_TYPES.map((x) => [x, labelOf(x)]) },
        { name: 'risk', label: 'Risiko', type: 'select', options: RISK_LEVELS.map((x) => [x, labelOf(x)]) },
        { name: 'status', label: 'Status', type: 'select', options: HAZARD_STATUSES.map((x) => [x, labelOf(x)]) },
        { name: 'category', label: 'Kategori', type: 'select', options: HAZARD_CATEGORIES.map((x) => [x, x]) },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={open}><Plus size={16} /> Laporkan bahaya</button>}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada hazard report."
          columns={[
            { key: 'n', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.site.code}</div></div>) },
            { key: 'w', label: 'Waktu', render: (r) => `${formatDate(r.observedAt)} ${time(r.observedAt)}` },
            { key: 'd', label: 'Temuan', render: (r) => (<div><Badge value={r.type} /> {r.category}<div className="muted">{r.location}</div></div>) },
            { key: 'r', label: 'Risiko', render: (r) => <Badge value={r.riskLevel} /> },
            { key: 'c', label: 'Tindakan', render: (r) => (r.capas.length ? `${r.capas.filter((c) => c.status === 'DITUTUP').length}/${r.capas.length} ditutup` : '-') },
            { key: 's', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.number} — ${labelOf(detail.type)}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.status} /><Badge value={detail.riskLevel} label={`Risiko ${labelOf(detail.riskLevel).toLowerCase()} (${detail.likelihood}×${detail.severity})`} /><span className="chip">{detail.category}</span></div>
            <dl className="detail-grid">
              <div><dt>Waktu</dt><dd>{formatDate(detail.observedAt)} {time(detail.observedAt)}</dd></div>
              <div><dt>Lokasi</dt><dd>{detail.location}</dd></div>
              <div><dt>Pelapor</dt><dd>{detail.reporterName}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Uraian bahaya</dt><dd className="pre-line">{detail.description}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Tindakan segera</dt><dd className="pre-line">{detail.immediateAction ?? '-'}</dd></div>
              {detail.closedAt && <div style={{ gridColumn: '1 / -1' }}><dt>Selesai</dt><dd>{formatDate(detail.closedAt)} · {detail.closedBy}<div className="muted">{detail.closedNote}</div></dd></div>}
            </dl>
            <div><div className="section-title">Foto</div><FileLinks files={detail.files} /></div>
            <Card title="Tindakan korektif" padding={0}>
              <DataTable rows={detail.capas} empty="Belum ada tindakan korektif." columns={[
                { key: 'n', label: 'Nomor', render: (c) => <Link href={`/actions/${c.id}`}>{c.number}</Link> },
                { key: 't', label: 'Tindakan', render: (c) => c.title },
                { key: 'p', label: 'PIC', render: (c) => c.picName },
                { key: 'd', label: 'Tenggat', render: (c) => formatDate(c.dueDate) },
                { key: 's', label: 'Status', render: (c) => <Badge value={c.status} /> },
              ]} />
            </Card>
            {canEdit && detail.status !== 'SELESAI' && (
              <div className="row-actions">
                {canClose && !detail.capas.some((c) => c.status !== 'DITUTUP') && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => close(detail)}><CheckCheck size={15} /> Tutup tanpa tindakan</button>}
                <button className="btn btn-primary btn-sm" onClick={() => { setFollow({ id: detail.id, capaTitle: '', picName: '', dueDate: '', capaRisk: detail.riskLevel }); setDetailId(null); }}><ListPlus size={15} /> Buat tindakan korektif</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(follow)} onClose={() => setFollow(null)} title="Tindakan korektif dari hazard report">
        {follow && (
          <form onSubmit={saveFollow} className="stack">
            <FormFields values={follow} setValues={setFollow} fields={[
              { name: 'capaTitle', label: 'Tindakan yang harus dilakukan', required: true, span: true },
              { name: 'picName', label: 'PIC', required: true },
              { name: 'capaRisk', label: 'Tingkat risiko', type: 'select', noEmpty: true, options: RISK_LEVELS.map((x) => [x, labelOf(x)]) },
              { name: 'dueDate', label: 'Tenggat', type: 'date', hint: `Kosong = ${DUE_DAYS[follow.capaRisk]} hari sesuai risiko.` },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Laporkan bahaya" subtitle="Unsafe act = perilaku tidak aman; unsafe condition = kondisi tidak aman. Bukan untuk kejadian yang sudah menimbulkan cedera/kerusakan (pakai modul Insiden)." size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: sites.filter((x) => x.isActive).map((x) => [x.id, `${x.code} — ${x.name}`]), required: true },
              { name: 'location', label: 'Lokasi', required: true, placeholder: 'mis. Pit 3 / Hauling KM 12' },
              { name: 'date', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
              { name: 'time', label: 'Jam', type: 'time', required: true },
              { name: 'type', label: 'Jenis temuan', type: 'select', noEmpty: true, options: HAZARD_TYPES.map((x) => [x, labelOf(x)]) },
              { name: 'category', label: 'Kategori', type: 'select', required: true, options: HAZARD_CATEGORIES.map((x) => [x, x]) },
              { name: 'description', label: 'Uraian bahaya', type: 'textarea', required: true, span: true },
              { name: 'immediateAction', label: 'Tindakan segera yang dilakukan', type: 'textarea', span: true },
              { name: 'likelihood', label: 'Kemungkinan terjadi', type: 'select', noEmpty: true, options: LIKELIHOOD.map(([v, l]) => [String(v), l]) },
              { name: 'severity', label: 'Keparahan bila terjadi', type: 'select', noEmpty: true, options: SEVERITY.map(([v, l]) => [String(v), l]) },
              { name: 'reporterName', label: 'Nama pelapor (opsional)', hint: 'Isi bila dilaporkan pekerja lain; kosong = nama Anda.' },
              { name: 'fixedOnSpot', label: 'Sudah diperbaiki di tempat (tidak perlu tindakan korektif)', type: 'checkbox', span: true },
              { section: 'Tindakan korektif (opsional — bisa juga dibuat HSE nanti)', name: 'capaSection', hidden: (v) => v.fixedOnSpot },
              { name: 'capaTitle', label: 'Tindakan yang harus dilakukan', span: true, hidden: (v) => v.fixedOnSpot },
              { name: 'picName', label: 'PIC', hidden: (v) => v.fixedOnSpot, hint: 'Isi PIC untuk langsung membuat tindakan korektif.' },
              { name: 'dueDate', label: 'Tenggat', type: 'date', hidden: (v) => v.fixedOnSpot },
            ]} />
            <RiskPreview l={Number(form.likelihood)} s={Number(form.severity)} />
            <div className="form-grid"><FileInput label="Foto temuan" accept="image/*" onChange={setFiles} /></div>
            <div className="modal-footer" style={{ padding: 0 }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Kirim laporan'}</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
