'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit, CheckCircle2, XCircle, Lock, Upload } from 'lucide-react';
import { Badge, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { labelOf } from '@/lib/labels';
import { WORK_PERMIT_STATUSES } from '@/lib/domain/work-permit';

const FILE_LABELS = { IZIN: 'Salinan izin owner', HIRADC: 'HIRADC / JSA', PENUTUPAN: 'Bukti penutupan', LAINNYA: 'Lampiran lain' };
const dt = (d) => (d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
// datetime-local memakai jam perangkat; dikirim sebagai ISO agar server tidak menebak zona waktu.
const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (v) => (v ? new Date(v).toISOString() : '');

export default function WorkPermitsClient({ sites, data, types, projects, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [files, setFiles] = useState([]);
  const [label, setLabel] = useState('IZIN');
  const [docs, setDocs] = useState([]);
  const detail = data.rows.find((r) => r.id === detailId);
  const siteOpts = sites.filter((s) => !s.isHo).map((s) => [s.id, `${s.code} — ${s.name}`]);
  const ownerOf = (projectId) => projects.find((p) => p.id === projectId)?.owner;
  const typeOptions = (projectId) => (types?.byOwner?.[ownerOf(projectId)] ?? types?.default ?? []);
  const formSite = form?.siteId;

  useEffect(() => {
    if (!formSite) return;
    fetch(`/api/csms/linkable-documents?siteId=${formSite}`).then((r) => (r.ok ? r.json() : { rows: [] })).then((d) => setDocs(d.rows ?? [])).catch(() => setDocs([]));
  }, [formSite]);

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    if (id) delete body.siteId;
    const res = await submit(id ? `/api/work-permits/${id}` : '/api/work-permits', { method: id ? 'PUT' : 'POST', body: { ...body, startAt: toIso(body.startAt), endAt: toIso(body.endAt) } });
    if (res) { setForm(null); if (!id && res.id) setDetailId(res.id); }
  };
  const act = async (p, action) => {
    let note = '';
    if (action === 'ACTIVATE' && !(await showConfirm('Tandai aktif hanya bila izin sudah diterbitkan owner dan salinannya terlampir. Aplikasi tidak menerbitkan izin.', 'Rekam izin aktif'))) return;
    if (action === 'CLOSE') { note = await showPrompt('Catatan penutupan (wajib bila bukti penutupan belum dilampirkan)', 'Tutup izin'); if (note === null) return; }
    if (action === 'CANCEL') { note = await showPrompt('Alasan pembatalan (wajib)', 'Batalkan izin'); if (!note?.trim()) return; }
    await submit(`/api/work-permits/${p.id}`, { body: { action, note } });
  };
  const upload = async () => {
    const fd = new FormData();
    fd.set('label', label);
    files.forEach((f) => fd.append('files', f));
    if (await submit(`/api/work-permits/${detail.id}/files`, { form: fd })) setFiles([]);
  };

  return (
    <div className="stack">
      <div className="notice info">Register izin kerja khusus yang <strong>diterbitkan owner</strong> untuk aktivitas berisiko (ketinggian, panas, ruang terbatas, dll.). Berbeda dari Permit & SKS personel (ID Card/Mine Permit). Status Aktif hanya merekam izin sah; aplikasi tidak menerbitkan izin owner.</div>
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nomor / pekerjaan / lokasi' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.filter((s) => !s.isHo).map((s) => [s.id, s.code]) },
        { name: 'status', label: 'Status', type: 'select', options: WORK_PERMIT_STATUSES.map((s) => [s, labelOf(s)]) },
        { name: 'type', label: 'Jenis izin', type: 'select', options: [...new Set([...(types?.default ?? []), ...Object.values(types?.byOwner ?? {}).flat()])] .map((t) => [t, t]) },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ siteId: siteOpts[0]?.[0] ?? '', projectId: '', number: '', permitType: '', workType: '', location: '', responsibleName: '', issuer: '', startAt: '', endAt: '', hiradcDocumentId: '', jsaNote: '' })}><Plus size={16} /> Catat izin</button>}
      </FilterBar>
      <div className="card">
        <DataTable rows={data.rows} empty="Belum ada izin kerja khusus." onRowClick={(r) => setDetailId(r.id)} columns={[
          { key: 'n', label: 'Nomor izin', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.permitType}</div></div>) },
          { key: 's', label: 'Site', render: (r) => (<div>{r.site.code}<div className="muted">{r.project?.owner ?? ''}</div></div>) },
          { key: 'w', label: 'Pekerjaan / lokasi', render: (r) => (<div style={{ maxWidth: 300 }}>{r.workType}<div className="muted">{r.location}</div></div>) },
          { key: 'p', label: 'Penanggung jawab / penerbit', render: (r) => (<div>{r.responsibleName}<div className="muted">{r.issuer}</div></div>) },
          { key: 't', label: 'Berlaku', render: (r) => (<div>{dt(r.startAt)}<div className="muted">s/d {dt(r.endAt)}</div></div>) },
          { key: 'st', label: 'Status', render: (r) => <Badge value={r.displayStatus} /> },
        ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Izin ${detail.number}` : ''} subtitle={detail ? `${detail.permitType} · ${detail.site.code}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge value={detail.displayStatus} />
              <div className="spacer" style={{ flex: 1 }} />
              {detail.canEdit && detail.status === 'TERCATAT' && <button className="btn btn-outline btn-sm" onClick={() => setForm({ id: detail.id, siteId: detail.siteId, projectId: detail.projectId ?? '', number: detail.number, permitType: detail.permitType, workType: detail.workType, location: detail.location, responsibleName: detail.responsibleName, issuer: detail.issuer, startAt: toLocalInput(detail.startAt), endAt: toLocalInput(detail.endAt), hiradcDocumentId: detail.hiradcDocumentId ?? '', jsaNote: detail.jsaNote ?? '' })}><Edit size={14} /> Ubah</button>}
              {detail.canEdit && detail.status === 'TERCATAT' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(detail, 'ACTIVATE')}><CheckCircle2 size={14} /> Rekam aktif</button>}
              {detail.canEdit && detail.status === 'AKTIF' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(detail, 'CLOSE')}><Lock size={14} /> Tutup izin</button>}
              {detail.canEdit && ['TERCATAT', 'AKTIF'].includes(detail.status) && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(detail, 'CANCEL')}><XCircle size={14} /> Batalkan</button>}
            </div>
            <dl className="detail-grid">
              <div><dt>Jenis pekerjaan</dt><dd>{detail.workType}</dd></div>
              <div><dt>Lokasi</dt><dd>{detail.location}</dd></div>
              <div><dt>Penanggung jawab</dt><dd>{detail.responsibleName}</dd></div>
              <div><dt>Penerbit / otoritas owner</dt><dd>{detail.issuer}</dd></div>
              <div><dt>Proyek / owner</dt><dd>{detail.project ? `${detail.project.name} — ${detail.project.owner}` : '-'}</dd></div>
              <div><dt>Waktu</dt><dd>{dt(detail.startAt)}<div className="muted">s/d {dt(detail.endAt)}</div></dd></div>
              <div><dt>HIRADC / JSA</dt><dd>{detail.hiradc ? `${detail.hiradc.number} rev ${detail.hiradc.revision}` : '-'}{detail.jsaNote && <div className="muted">{detail.jsaNote}</div>}</dd></div>
              {detail.closedAt && <div><dt>Ditutup</dt><dd>{dt(detail.closedAt)}<div className="muted">{detail.closureNote ?? ''}</div></dd></div>}
              {detail.cancelReason && <div><dt>Dibatalkan</dt><dd>{detail.cancelReason}</dd></div>}
            </dl>
            <div>
              <div className="section-title">Lampiran</div>
              {Object.entries(FILE_LABELS).map(([k, l]) => {
                const list = detail.files.filter((f) => f.label === k);
                return list.length ? <div key={k} style={{ marginBottom: 8 }}><div className="muted">{l}</div><FileLinks files={list} /></div> : null;
              })}
              {!detail.files.length && <p className="muted">Belum ada lampiran. Salinan izin owner wajib sebelum direkam aktif.</p>}
            </div>
            {detail.canEdit && !['DITUTUP', 'DIBATALKAN'].includes(detail.status) && (
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Jenis lampiran</label>
                  <select className="form-select" value={label} onChange={(e) => setLabel(e.target.value)}>
                    {Object.entries(FILE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <FileInput label="File" onChange={(f) => setFiles(f)} />
                {files.length > 0 && <button className="btn btn-outline btn-sm" style={{ width: 'fit-content' }} disabled={busy} onClick={upload}><Upload size={14} /> Unggah {files.length} file</button>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Ubah izin kerja khusus' : 'Catat izin kerja khusus'} subtitle="Isi sesuai izin yang diterbitkan owner. Jenis izin mengikuti daftar owner proyek (parameter workPermit.types)." size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              ...(form.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', required: true, noEmpty: true, options: siteOpts }]),
              { name: 'projectId', label: 'Proyek / owner', type: 'select', options: projects.filter((p) => p.siteId === form.siteId).map((p) => [p.id, `${p.name} — ${p.owner}`]) },
              { name: 'number', label: 'Nomor izin dari owner', required: true },
              { name: 'permitType', label: 'Jenis izin', type: 'select', required: true, options: typeOptions(form.projectId).map((t) => [t, t]) },
              { name: 'workType', label: 'Jenis pekerjaan', required: true, span: true },
              { name: 'location', label: 'Lokasi', required: true },
              { name: 'responsibleName', label: 'Penanggung jawab', required: true },
              { name: 'issuer', label: 'Penerbit / otoritas owner', required: true },
              { name: 'startAt', label: 'Mulai', type: 'datetime-local', required: true },
              { name: 'endAt', label: 'Berakhir', type: 'datetime-local', required: true },
              { name: 'hiradcDocumentId', label: 'HIRADC / JSA (Dokumen HSE)', type: 'select', options: docs.map((d) => [d.id, `${d.number} rev ${d.revision} — ${d.title}`]) },
              { name: 'jsaNote', label: 'Catatan HIRADC/JSA', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}

