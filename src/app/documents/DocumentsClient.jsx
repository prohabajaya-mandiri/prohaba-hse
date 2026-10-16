'use client';

import { useState } from 'react';
import { Plus, Edit, Download, History } from 'lucide-react';
import { Badge, DataTable, FileInput, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const CATEGORIES = ['HSE_PLAN', 'KPLH', 'SOP', 'IBPR', 'SMKP', 'AUDIT', 'STANDARISASI_MITRA', 'PRAKUALIFIKASI', 'SERTIFIKASI', 'COMPLIANCE_OWNER', 'LAINNYA'];

export default function DocumentsClient({ user, sites, data, page }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [versions, setVersions] = useState(null);
  const canCreate = ['HO_HSE', 'HSE_SITE'].includes(user.role);
  const siteOpts = [...(user.role === 'HO_HSE' ? [['', 'HO / seluruh site']] : []), ...sites.filter((s) => !s.isHo).map((s) => [s.id, s.code])];

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    if (id) delete body.siteId;
    const fd = new FormData();
    fd.set('data', JSON.stringify(body));
    if (file) fd.set('file', file);
    if (await submit(id ? `/api/documents/${id}` : '/api/documents', { method: id ? 'PUT' : 'POST', form: fd })) setForm(null);
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Judul, nomor, PIC' },
        { name: 'siteId', label: 'Site', type: 'select', options: [['HO', 'Dokumen HO'], ...sites.filter((s) => !s.isHo).map((s) => [s.id, s.code])] },
        { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES },
        { name: 'status', label: 'Status', type: 'select', allLabel: 'Aktif', options: [['ARSIP', 'Arsip'], ['all', 'Semua']] },
        { name: 'expiry', label: 'Masa berlaku', type: 'select', options: [['soon', `Habis ≤ ${data.threshold} hari`], ['expired', 'Kedaluwarsa']] },
      ]}>
        {canCreate && <button className="btn btn-primary" onClick={() => { setFile(null); setForm({ number: '', title: '', category: 'SOP', siteId: user.role === 'HO_HSE' ? '' : sites.find((s) => !s.isHo)?.id ?? '', issueDate: todayIso(), validUntil: '', ownerName: '', status: 'BERLAKU', revision: '0', notes: '' }); }}><Plus size={16} /> Dokumen</button>}
      </FilterBar>
      <div className="card">
        <DataTable rows={data.rows} empty="Belum ada dokumen."
          columns={[
            { key: 'number', label: 'Nomor', render: (d) => (<div><strong>{d.number}</strong><div className="muted">Rev {d.revision}</div></div>) },
            { key: 'title', label: 'Judul', render: (d) => (<div>{d.title}<div className="muted">{labelOf(d.category)} · {d.site?.code ?? 'HO'}</div></div>) },
            { key: 'owner', label: 'Penanggung jawab', render: (d) => d.ownerName },
            { key: 'issue', label: 'Terbit', render: (d) => formatDate(d.issueDate) },
            { key: 'valid', label: 'Berlaku s/d', render: (d) => (d.validUntil ? (<div>{formatDate(d.validUntil)}{d.expiry !== 'VALID' && <div><Badge value={d.expiry} /></div>}</div>) : <span className="muted">Tanpa masa berlaku</span>) },
            { key: 'status', label: 'Status', render: (d) => <Badge value={d.status} /> },
            {
              key: 'a', label: '', render: (d) => (
                <div className="row-actions">
                  {d.versions[0]?.file && <a className="btn btn-ghost btn-sm" title="Unduh versi terbaru" href={`/api/files/${d.versions[0].fileId}`}><Download size={14} /></a>}
                  <button className="btn btn-ghost btn-sm" title="Riwayat versi" onClick={() => setVersions(d)}><History size={14} /></button>
                  {d.canEdit && <button className="btn btn-ghost btn-sm" title="Edit / revisi" onClick={() => { setFile(null); setForm({ id: d.id, number: d.number, title: d.title, category: d.category, issueDate: iso(d.issueDate), validUntil: iso(d.validUntil) ?? '', ownerName: d.ownerName, status: d.status, revision: d.revision, notes: '' }); }}><Edit size={14} /></button>}
                </div>
              ),
            },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(versions)} onClose={() => setVersions(null)} title={`Riwayat versi — ${versions?.number ?? ''}`}>
        {versions && (
          <DataTable rows={versions.versions} columns={[
            { key: 'rev', label: 'Revisi', render: (v) => v.revision },
            { key: 'at', label: 'Diunggah', render: (v) => formatDate(v.createdAt) },
            { key: 'notes', label: 'Catatan', render: (v) => v.notes ?? '-' },
            { key: 'f', label: 'File', render: (v) => (v.file ? <a href={`/api/files/${v.fileId}`}>{v.file.fileName}</a> : '-') },
          ]} />
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit dokumen / unggah revisi' : 'Dokumen baru'} subtitle="Pengingat kedaluwarsa hanya untuk dokumen yang memiliki masa berlaku." size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'number', label: 'Nomor dokumen', required: true },
              { name: 'title', label: 'Judul', required: true },
              { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES, required: true, noEmpty: true },
              ...(form.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', options: siteOpts, noEmpty: true }]),
              { name: 'issueDate', label: 'Tanggal terbit', type: 'date', required: true },
              { name: 'validUntil', label: 'Berlaku sampai', type: 'date', hint: 'Kosongkan bila tidak memiliki masa berlaku.' },
              { name: 'ownerName', label: 'Penanggung jawab', required: true },
              { name: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'BERLAKU', 'ARSIP'], noEmpty: true },
              { name: 'revision', label: form.id ? 'Revisi (ubah bila unggah file baru)' : 'Revisi', required: true },
              { name: 'notes', label: 'Catatan versi', type: 'textarea', span: true },
            ]} />
            <div className="form-grid"><FileInput label={form.id ? 'File revisi baru (opsional)' : 'File dokumen (wajib)'} multiple={false} onChange={(f) => setFile(f[0] ?? null)} /></div>
            <button className="btn btn-primary" disabled={busy || (!form.id && !file)}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
