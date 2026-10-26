'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Edit, Download, Trash2, CheckCircle2 } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, PersonnelPicker, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const STATUSES = ['OPEN', 'INVESTIGASI', 'TINDAK_LANJUT', 'CLOSED'];
const time = (d) => new Date(d).toISOString().slice(11, 16);

export default function IncidentsClient({ sites, data, cfg, page, canEdit }) {
  const params = useSearchParams();
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [victims, setVictims] = useState([]);
  const [files, setFiles] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [action, setAction] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);

  const open = (r) => {
    setFiles([]);
    if (!r) {
      setVictims([]);
      return setForm({ siteId: sites.length === 1 ? sites[0].id : '', date: todayIso(), time: '08:00', location: '', category: 'NEAR_MISS', title: '', chronology: '', impact: '', initialAction: '', lostDays: 0 });
    }
    setVictims(r.victims.map((v) => ({ personnelId: v.personnelId ?? '', name: v.name, injury: v.injury ?? '', bodyPart: v.bodyPart ?? '' })));
    setForm({
      id: r.id, date: iso(r.occurredAt), time: time(r.occurredAt), location: r.location, category: r.category, title: r.title, chronology: r.chronology,
      impact: r.impact ?? '', initialAction: r.initialAction ?? '', lostDays: r.lostDays, investigator: r.investigator ?? '', investigatedAt: iso(r.investigatedAt) ?? '',
      immediateCause: r.immediateCause ?? '', rootCause: r.rootCause ?? '', reportedToOwner: r.reportedToOwner, status: r.status,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...body, victims }));
    files.forEach((f) => fd.append('files', f));
    if (await submit(id ? `/api/incidents/${id}` : '/api/incidents', { method: id ? 'PUT' : 'POST', form: fd })) setForm(null);
  };

  const baseFields = [
    ...(form?.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', options: sites.filter((s) => s.isActive).map((s) => [s.id, `${s.code} — ${s.name}`]), required: true }]),
    { name: 'category', label: 'Kategori', type: 'select', options: cfg.categories, required: true, noEmpty: true },
    { name: 'date', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
    { name: 'time', label: 'Jam', type: 'time', required: true },
    { name: 'location', label: 'Lokasi', required: true },
    { name: 'lostDays', label: 'Hari kerja hilang', type: 'number', min: 0 },
    { name: 'title', label: 'Judul singkat', required: true, span: true },
    { name: 'chronology', label: 'Kronologi', type: 'textarea', required: true, span: true, rows: 4 },
    { name: 'impact', label: 'Dampak', type: 'textarea', span: true },
    { name: 'initialAction', label: 'Penanganan awal', type: 'textarea', span: true },
  ];
  const investigationFields = [
    { section: 'Investigasi' },
    { name: 'investigator', label: 'Investigator' },
    { name: 'investigatedAt', label: 'Tanggal investigasi', type: 'date' },
    { name: 'immediateCause', label: 'Penyebab langsung', type: 'textarea', span: true },
    { name: 'rootCause', label: 'Akar masalah', type: 'textarea', span: true, hint: 'Wajib sebelum ditutup.' },
    { name: 'status', label: 'Status', type: 'select', options: STATUSES, noEmpty: true },
    { name: 'reportedToOwner', label: 'Sudah dilaporkan ke owner/regulator', type: 'checkbox' },
  ];

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Judul / nomor' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'category', label: 'Kategori', type: 'select', options: cfg.categories },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        <a className="btn btn-outline" href={'/api/incidents/export?' + params.toString()}><Download size={16} /> Excel</a>
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Laporkan insiden</button>}
      </FilterBar>
      <div className="notice info">Kategori dan tenggat pelaporan mengikuti standar owner/regulator (parameter draft). Insiden otomatis direkap pada indikator kejadian HSE Performance dan laporan HSE.</div>
      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada insiden tercatat."
          columns={[
            { key: 'number', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.site.code}</div></div>) },
            { key: 'when', label: 'Waktu', render: (r) => `${formatDate(r.occurredAt)} ${time(r.occurredAt)}` },
            { key: 'cat', label: 'Kategori', render: (r) => <Badge value={r.category} /> },
            { key: 'title', label: 'Kejadian', render: (r) => (<div>{r.title}<div className="muted">{r.location}</div></div>) },
            { key: 'victims', label: 'Korban', num: true, render: (r) => r.victims.length },
            { key: 'act', label: 'Tindakan', render: (r) => `${r.actions.filter((a) => a.status === 'DONE').length}/${r.actions.length}` },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.number} — ${detail.title}` : ''} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.category} /><Badge value={detail.status} />{detail.reportedToOwner ? <span className="chip">Dilaporkan ke owner</span> : <span className="chip">Belum dilaporkan ke owner</span>}</div>
            <dl className="detail-grid">
              <div><dt>Waktu</dt><dd>{formatDate(detail.occurredAt)} {time(detail.occurredAt)}</dd></div>
              <div><dt>Lokasi</dt><dd>{detail.location}</dd></div>
              <div><dt>Hari hilang</dt><dd>{detail.lostDays}</dd></div>
              <div><dt>Pelapor</dt><dd>{detail.creatorName}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Kronologi</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{detail.chronology}</dd></div>
              <div><dt>Dampak</dt><dd>{detail.impact ?? '-'}</dd></div>
              <div><dt>Penanganan awal</dt><dd>{detail.initialAction ?? '-'}</dd></div>
              <div><dt>Penyebab langsung</dt><dd>{detail.immediateCause ?? '-'}</dd></div>
              <div><dt>Akar masalah</dt><dd>{detail.rootCause ?? '-'}</dd></div>
              {detail.closedAt && <div><dt>Ditutup</dt><dd>{formatDate(detail.closedAt)} · {detail.closedBy}</dd></div>}
            </dl>
            <Card title="Korban" padding={0}>
              <DataTable rows={detail.victims} empty="Tidak ada korban." columns={[{ key: 'name', label: 'Nama' }, { key: 'injury', label: 'Cedera' }, { key: 'bodyPart', label: 'Bagian tubuh' }]} />
            </Card>
            <Card title="Tindakan korektif & pencegahan" padding={0}
              actions={canEdit && detail.status !== 'CLOSED' && <button className="btn btn-outline btn-sm" onClick={() => setAction({ type: 'KOREKTIF', description: '', pic: '', dueDate: '', status: 'OPEN' })}><Plus size={14} /> Tindakan</button>}>
              <DataTable rows={detail.actions} empty="Belum ada tindakan." columns={[
                { key: 'type', label: 'Jenis', render: (a) => labelOf(a.type) },
                { key: 'description', label: 'Tindakan' },
                { key: 'pic', label: 'PIC' },
                { key: 'due', label: 'Tenggat', render: (a) => formatDate(a.dueDate) },
                { key: 'status', label: 'Status', render: (a) => <Badge value={a.status} /> },
                { key: 'e', label: '', render: (a) => canEdit && detail.status !== 'CLOSED' && a.status !== 'DONE' && (
                  <button className="btn btn-ghost btn-sm" title="Tandai selesai" onClick={() => submit(`/api/incidents/${detail.id}/actions`, { body: { id: a.id, type: a.type, description: a.description, pic: a.pic, dueDate: iso(a.dueDate) ?? '', status: 'DONE' } })}><CheckCircle2 size={15} /></button>
                ) },
              ]} />
            </Card>
            <div><div className="section-title">Foto & dokumen</div><FileLinks files={detail.files} /></div>
            {canEdit && <div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => { const r = detail; setDetailId(null); open(r); }}><Edit size={15} /> Perbarui / investigasi</button></div>}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(action)} onClose={() => setAction(null)} title="Tindakan korektif / pencegahan">
        {action && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await submit(`/api/incidents/${detail.id}/actions`, { body: action })) setAction(null); }}>
            <FormFields values={action} setValues={setAction} fields={[
              { name: 'type', label: 'Jenis', type: 'select', options: ['KOREKTIF', 'PENCEGAHAN'], noEmpty: true },
              { name: 'pic', label: 'Penanggung jawab', required: true },
              { name: 'description', label: 'Tindakan', type: 'textarea', required: true, span: true },
              { name: 'dueDate', label: 'Tenggat', type: 'date' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Perbarui insiden' : 'Laporkan insiden'} subtitle="Bukan modul Inspeksi & Temuan. Kewajiban pelaporan mengikuti ketentuan owner/regulator." size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={form.id ? [...baseFields, ...investigationFields] : baseFields} />
            <div>
              <div className="section-title">Korban</div>
              {victims.map((v, i) => (
                <div key={i} className="form-grid-3" style={{ alignItems: 'end', marginBottom: 8 }}>
                  <div className="form-group"><label className="form-label">Nama</label><input className="form-input" value={v.name} onChange={(e) => setVictims(victims.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} required /></div>
                  <div className="form-group"><label className="form-label">Cedera</label><input className="form-input" value={v.injury} onChange={(e) => setVictims(victims.map((x, j) => (j === i ? { ...x, injury: e.target.value } : x)))} /></div>
                  <div className="form-group" style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}><label className="form-label">Bagian tubuh</label><input className="form-input" value={v.bodyPart} onChange={(e) => setVictims(victims.map((x, j) => (j === i ? { ...x, bodyPart: e.target.value } : x)))} /></div>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => setVictims(victims.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              <div style={{ maxWidth: 420 }}>
                <PersonnelPicker value="" onChange={(pid, p) => p && setVictims([...victims, { personnelId: pid, name: p.name, injury: '', bodyPart: '' }])} />
                <div className="form-hint">Cari personel, atau <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVictims([...victims, { personnelId: '', name: '', injury: '', bodyPart: '' }])}>tambah korban non-personel</button></div>
              </div>
            </div>
            <div className="form-grid"><FileInput label="Foto kejadian" accept="image/*,.pdf" onChange={setFiles} /></div>
            <div className="modal-footer" style={{ padding: 0 }}><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
