'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, Send, CheckCheck, Undo2, RotateCcw, Edit, Save } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { RISK_LEVELS } from '@/lib/domain/field-safety';

const ACTIONS = {
  START: ['Mulai kerjakan', Play, 'btn-outline'],
  SUBMIT_CLOSE: ['Ajukan penutupan', Send, 'btn-primary'],
  RETURN: ['Kembalikan', Undo2, 'btn-outline'],
  CLOSE: ['Tutup (verifikasi)', CheckCheck, 'btn-primary'],
  REOPEN: ['Buka kembali', RotateCcw, 'btn-outline'],
};
const NOTE_REQUIRED = ['RETURN', 'REOPEN'];
const STEP = { CREATE: 'Dibuat', EDIT: 'Diubah', START: 'Mulai dikerjakan', SUBMIT_CLOSE: 'Diajukan untuk penutupan', RETURN: 'Dikembalikan', CLOSE: 'Ditutup', REOPEN: 'Dibuka kembali' };
const SOURCE_LINK = { HAZARD: (c) => `/hazards?q=${encodeURIComponent(c.sourceRef ?? '')}`, INSPECTION: (c) => `/inspections?q=${encodeURIComponent(c.sourceRef ?? '')}` };

export default function ActionDetail({ capa: c }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [done, setDone] = useState(c.correctiveAction ?? '');
  const [files, setFiles] = useState([]);
  const [edit, setEdit] = useState(null);
  const high = ['TINGGI', 'EKSTREM'].includes(c.riskLevel);

  const run = async (a) => {
    if (a === 'SUBMIT_CLOSE' && done !== (c.correctiveAction ?? '')) {
      if (!(await submit(`/api/actions/${c.id}`, { method: 'PUT', body: { correctiveAction: done } }))) return;
    }
    let note = '';
    if (NOTE_REQUIRED.includes(a) || a === 'CLOSE') {
      const res = await showPrompt(NOTE_REQUIRED.includes(a) ? 'Alasan (wajib)' : 'Catatan verifikasi (opsional)', ACTIONS[a][0]);
      if (res === null || (NOTE_REQUIRED.includes(a) && !res.trim())) return;
      note = res;
    } else if (a === 'SUBMIT_CLOSE' && !(await showConfirm(`Ajukan penutupan? Tindakan ditutup setelah diverifikasi ${high ? 'HO HSE' : 'HSE Site / HO HSE'}.`, 'Ajukan penutupan'))) return;
    await submit(`/api/actions/${c.id}`, { body: { action: a, note } });
  };
  const upload = async () => {
    const fd = new FormData();
    files.forEach((x) => fd.append('files', x));
    if (await submit(`/api/actions/${c.id}/files`, { form: fd })) setFiles([]);
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (await submit(`/api/actions/${c.id}`, { method: 'PUT', body: edit })) setEdit(null);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <Link className="btn btn-ghost btn-sm" href="/actions">← Tindakan Korektif</Link>
        <Badge value={c.status} />
        <Badge value={c.riskLevel} label={`Risiko ${labelOf(c.riskLevel).toLowerCase()}`} />
        {c.late && <Badge value="OVERDUE" label="Terlambat" />}
        <div className="spacer" />
        {c.canEdit && <button className="btn btn-outline btn-sm" onClick={() => setEdit({ title: c.title, description: c.description ?? '', riskLevel: c.riskLevel, picName: c.picName, dueDate: iso(c.dueDate), correctiveAction: c.correctiveAction ?? '' })}><Edit size={15} /> Ubah</button>}
      </div>

      <Card title={c.title}>
        <div className="stack" style={{ gap: 12 }}>
          {c.description && <div className="pre-line">{c.description}</div>}
          <dl className="detail-grid">
            <div><dt>Sumber</dt><dd>{labelOf(c.sourceType)}{c.sourceRef && <> · {SOURCE_LINK[c.sourceType] ? <Link href={SOURCE_LINK[c.sourceType](c)}>{c.sourceRef}</Link> : c.sourceRef}</>}</dd></div>
            <div><dt>Site</dt><dd>{c.site.code} — {c.site.name}</dd></div>
            <div><dt>PIC</dt><dd>{c.picName}</dd></div>
            <div><dt>Tenggat</dt><dd className={c.late ? 'text-red' : ''}>{formatDate(c.dueDate)} {c.tz}</dd></div>
            <div><dt>Dibuat</dt><dd>{c.createdByName}<div className="muted">{formatDate(c.createdAt)}</div></dd></div>
            <div><dt>Verifikasi penutupan</dt><dd>{c.verifierName ? <>{c.verifierName}<div className="muted">{formatDate(c.closedAt)}</div></> : high ? 'HO HSE (risiko tinggi/ekstrem)' : 'HSE Site / HO HSE'}</dd></div>
          </dl>
        </div>
      </Card>

      <Card title="Tindakan yang dilakukan & bukti">
        <div className="stack">
          {c.canWork ? (
            <div className="form-group">
              <label className="form-label">Tindakan yang sudah dilakukan</label>
              <textarea className="form-input" rows={4} value={done} onChange={(e) => setDone(e.target.value)} placeholder="Uraikan perbaikan yang dilakukan" />
              <button className="btn btn-outline btn-sm" style={{ width: 'fit-content', marginTop: 8 }} disabled={busy || done === (c.correctiveAction ?? '')} onClick={() => submit(`/api/actions/${c.id}`, { method: 'PUT', body: { correctiveAction: done } })}><Save size={14} /> Simpan</button>
            </div>
          ) : <div className="pre-line">{c.correctiveAction || <span className="muted">Belum diisi.</span>}</div>}
          <FileLinks files={c.files} />
          {c.canWork && (
            <div className="form-grid">
              <FileInput label="Foto / bukti penyelesaian (wajib sebelum diajukan)" accept="image/*,.pdf" onChange={(x) => setFiles(x)} />
              {files.length > 0 && <button className="btn btn-outline btn-sm" style={{ width: 'fit-content' }} disabled={busy} onClick={upload}>Unggah {files.length} file</button>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.actions.map((a) => {
              const [label, Icon, cls] = ACTIONS[a];
              return <button key={a} className={`btn btn-sm ${cls}`} disabled={busy} onClick={() => run(a)}><Icon size={15} /> {label}</button>;
            })}
            {!c.actions.length && <span className="muted">{c.status === 'DIAJUKAN_TUTUP' ? `Menunggu verifikasi ${high ? 'HO HSE' : 'HSE Site / HO HSE'}.` : c.status === 'DITUTUP' ? 'Tindakan sudah ditutup.' : 'Tidak ada aksi untuk peran Anda.'}</span>}
          </div>
        </div>
      </Card>

      <Card title="Riwayat" padding={0}>
        <DataTable rows={c.history} columns={[
          { key: 'at', label: 'Waktu', render: (h) => new Date(h.createdAt).toLocaleString('id-ID') },
          { key: 'a', label: 'Langkah', render: (h) => STEP[h.action] ?? h.action },
          { key: 's', label: 'Status', render: (h) => <Badge value={h.toStatus} /> },
          { key: 'by', label: 'Oleh', render: (h) => h.actorName },
          { key: 'n', label: 'Catatan', render: (h) => h.note ?? '-' },
        ]} />
      </Card>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Ubah tindakan korektif" size="modal-lg">
        {edit && (
          <form onSubmit={saveEdit} className="stack">
            <FormFields values={edit} setValues={setEdit} fields={[
              { name: 'title', label: 'Tindakan yang harus dilakukan', required: true, span: true },
              { name: 'riskLevel', label: 'Tingkat risiko', type: 'select', noEmpty: true, options: RISK_LEVELS.map((x) => [x, labelOf(x)]) },
              { name: 'picName', label: 'PIC', required: true },
              { name: 'dueDate', label: `Tenggat (${c.tz})`, type: 'date', required: true },
              { name: 'description', label: 'Uraian', type: 'textarea', span: true },
              { name: 'correctiveAction', label: 'Tindakan yang dilakukan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
