'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, RotateCw, Ban } from 'lucide-react';
import { Badge, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { apiFetch } from '@/lib/client-api';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const EMPTY = { personnelId: '', kind: 'PERMIT', permitType: '', number: '', issuer: '', startDate: todayIso(), endDate: '', basisResult: '', mcuId: '', isTemporary: false, notes: '', previousId: '' };

export default function PermitsClient({ sites, data, page, canEdit, preselect }) {
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [form, setForm] = useState(preselect && canEdit ? { ...EMPTY, personnelId: preselect } : null);
  const [files, setFiles] = useState([]);
  const [hint, setHint] = useState(null);
  const [detail, setDetail] = useState(null);
  const { cfg } = data;

  // Ambil hasil MCU terbaru sebagai acuan; tanggal akhir tetap diisi sesuai keputusan owner.
  const loadHint = async (personnelId, startDate) => {
    if (!personnelId) return setHint(null);
    try {
      const r = await (await apiFetch(`/api/permits/suggest?personnelId=${personnelId}&startDate=${startDate || todayIso()}`)).json();
      setHint(r);
      setForm((f) => ({ ...f, basisResult: f.basisResult || r.mcu?.result || '', mcuId: r.mcu?.id ?? '', isTemporary: r.mcu?.result === 'FOLLOW_UP' ? true : f.isTemporary }));
    } catch {
      setHint(null);
    }
  };

  const setValues = (updater) => {
    setForm((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next.personnelId !== prev.personnelId || next.startDate !== prev.startDate) setTimeout(() => loadHint(next.personnelId, next.startDate), 0);
      return next;
    });
  };

  const openForm = (row, renew = false) => {
    setFiles([]);
    setHint(null);
    if (!row) return setForm({ ...EMPTY });
    const base = { personnelId: row.personnelId, personName: row.personnel.name, kind: row.kind, permitType: row.permitType, issuer: row.issuer ?? '', basisResult: '', mcuId: '', isTemporary: false, notes: '' };
    if (renew) {
      setForm({ ...base, number: '', startDate: iso(row.endDate) ?? todayIso(), endDate: '', previousId: row.id });
      loadHint(row.personnelId, iso(row.endDate));
    } else {
      setForm({ ...base, id: row.id, number: row.number, startDate: iso(row.startDate), endDate: iso(row.endDate), basisResult: row.basisResult ?? '', mcuId: row.mcuId ?? '', isTemporary: row.isTemporary, notes: row.notes ?? '' });
    }
  };

  const save = async (e, acknowledge = false) => {
    e?.preventDefault();
    const { id, personName, ...body } = form;
    void personName;
    if (!body.previousId) delete body.previousId;
    if (id) delete body.personnelId;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...body, acknowledge }));
    files.forEach((f) => fd.append('files', f));
    const r = await submit(id ? `/api/permits/${id}` : '/api/permits', { method: id ? 'PUT' : 'POST', form: fd, confirm422: true });
    if (r?.needsConfirm) {
      if (await showConfirm(r.message.replace('Perlu konfirmasi: ', '') + ' Tetap simpan sesuai keputusan owner/otoritas site?', 'Peringatan kelayakan')) return save(null, true);
      return;
    }
    if (r) setForm(null);
  };

  const revoke = async (row) => {
    const reason = await showPrompt('Alasan pencabutan', `Cabut ${row.number}`);
    if (reason) {
      await submit(`/api/permits/${row.id}/revoke`, { body: { reason } });
      setDetail(null);
    }
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nama / nomor' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'kind', label: 'Jenis', type: 'select', options: ['PERMIT', 'SKS'] },
        { name: 'status', label: 'Status', type: 'select', options: ['AKTIF', 'AKAN_HABIS', 'KEDALUWARSA', 'DICABUT'] },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => openForm(null)}><Plus size={16} /> Input permit / SKS</button>}
      </FilterBar>
      <div className="notice info">
        Acuan: FIT → permit {cfg.defaults.fitMonths} bulan; FOLLOW UP → permit sementara {cfg.defaults.followUpMonths} bulan bila disetujui; UNFIT tidak memenuhi syarat.
        Sistem tidak menerbitkan permit otomatis — data mengikuti keputusan owner/otoritas site. Pengingat {cfg.threshold} hari sebelum habis; permit FU yang habis memicu FU ulang.
      </div>
      <div className="card">
        <DataTable rows={data.rows} onRowClick={setDetail} empty="Belum ada permit."
          columns={[
            { key: 'p', label: 'Personel', render: (r) => (<div><strong>{r.personnel.name}</strong><div className="muted">{r.personnel.code} · {r.site.code}</div></div>) },
            { key: 'kind', label: 'Jenis', render: (r) => (<div>{labelOf(r.kind)}<div className="muted">{r.permitType}</div></div>) },
            { key: 'number', label: 'Nomor' },
            { key: 'basis', label: 'Acuan MCU', render: (r) => (<div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}><Badge value={r.basisResult} />{r.isTemporary && <span className="chip">Sementara</span>}</div>) },
            { key: 'period', label: 'Masa berlaku', render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
            { key: 'status', label: 'Status', render: (r) => (<div><Badge value={r.status} />{r.renewed && <div className="muted">sudah diperpanjang</div>}</div>) },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${labelOf(detail.kind)} ${detail.number}` : ''}>
        {detail && (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>Personel</dt><dd><Link href={'/personnel/' + detail.personnelId}>{detail.personnel.name}</Link></dd></div>
              <div><dt>Jenis</dt><dd>{detail.permitType}</dd></div>
              <div><dt>Penerbit</dt><dd>{detail.issuer ?? '-'}</dd></div>
              <div><dt>Masa berlaku</dt><dd>{formatDate(detail.startDate)} – {formatDate(detail.endDate)}</dd></div>
              <div><dt>Status</dt><dd><Badge value={detail.status} /></dd></div>
              <div><dt>Acuan MCU</dt><dd><Badge value={detail.basisResult} /></dd></div>
              {detail.revokeReason && <div><dt>Alasan dicabut</dt><dd>{detail.revokeReason}</dd></div>}
              <div><dt>Catatan</dt><dd>{detail.notes ?? '-'}</dd></div>
            </dl>
            <FileLinks files={detail.files} />
            {canEdit && (
              <div className="row-actions">
                {!detail.revokedAt && <button className="btn btn-ghost btn-sm" onClick={() => revoke(detail)}><Ban size={15} /> Cabut</button>}
                {!detail.renewed && <button className="btn btn-outline btn-sm" onClick={() => { setDetail(null); openForm(detail, true); }}><RotateCw size={15} /> Perpanjang</button>}
                <button className="btn btn-primary btn-sm" onClick={() => { setDetail(null); openForm(detail); }}><Edit size={15} /> Edit</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit permit' : form?.previousId ? `Perpanjangan — ${form.personName}` : 'Input permit / SKS'} size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            {hint?.mcu && (
              <div className={`notice ${hint.mcu.result === 'UNFIT' ? 'danger' : 'info'}`}>
                MCU terbaru: <strong>{labelOf(hint.mcu.result)}</strong> ({formatDate(hint.mcu.mcuDate)}).
                {hint.suggestedEnd ? <> Acuan berakhir: <strong>{formatDate(hint.suggestedEnd)}</strong>{' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, endDate: iso(hint.suggestedEnd) })}>Pakai</button></> : hint.mcu.result === 'UNFIT' ? ' Personel tidak memenuhi syarat pekerjaan terkait.' : ''}
              </div>
            )}
            {hint && !hint.mcu && <div className="notice">Personel belum memiliki catatan MCU.</div>}
            <FormFields values={form} setValues={setValues} fields={[
              ...(form.id || form.previousId ? [] : [{ name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true }]),
              { name: 'kind', label: 'Jenis', type: 'select', options: ['PERMIT', 'SKS'], required: true, noEmpty: true },
              { name: 'permitType', label: 'Jenis permit', type: 'select', options: [...new Set([...cfg.types, form.permitType].filter(Boolean))].map((t) => [t, t]), required: true },
              { name: 'number', label: 'Nomor', required: true },
              { name: 'issuer', label: 'Penerbit (owner/otoritas)' },
              { name: 'startDate', label: 'Berlaku mulai', type: 'date', required: true },
              { name: 'endDate', label: 'Berlaku sampai', type: 'date', required: true },
              { name: 'basisResult', label: 'Hasil MCU acuan', type: 'select', options: ['FIT', 'FOLLOW_UP', 'UNFIT'] },
              { name: 'isTemporary', label: 'Permit sementara (status Follow Up)', type: 'checkbox' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div className="form-grid"><FileInput label="Dokumen permit" onChange={setFiles} /></div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>Simpan</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
