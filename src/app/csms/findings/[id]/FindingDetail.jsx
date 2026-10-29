'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play, Send, CheckCheck, Undo2, RotateCcw, Edit, Save } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { FINDING_SOURCES, PIC_ROLES } from '@/lib/domain/csms';

const ACTIONS = {
  START: ['Mulai tindak lanjut', Play, 'btn-outline'],
  SUBMIT_CLOSE: ['Ajukan penutupan', Send, 'btn-primary'],
  RETURN: ['Kembalikan', Undo2, 'btn-outline'],
  CLOSE: ['Tutup temuan (verifikasi)', CheckCheck, 'btn-primary'],
  REOPEN: ['Buka kembali', RotateCcw, 'btn-outline'],
};
const NOTE_REQUIRED = ['RETURN', 'REOPEN'];
const STEP = { CREATE: 'Dicatat', EDIT: 'Diubah', START: 'Mulai tindak lanjut', SUBMIT_CLOSE: 'Diajukan untuk penutupan', RETURN: 'Dikembalikan', CLOSE: 'Ditutup', REOPEN: 'Dibuka kembali' };

export default function FindingDetail({ finding: f }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [action, setAction] = useState(f.correctiveAction ?? '');
  const [files, setFiles] = useState([]);
  const [edit, setEdit] = useState(null);
  const r = f.requirement;

  const run = async (a) => {
    if (a === 'SUBMIT_CLOSE' && action !== (f.correctiveAction ?? '')) {
      if (!(await submit(`/api/csms/findings/${f.id}`, { method: 'PUT', body: { correctiveAction: action } }))) return;
    }
    let note = '';
    if (NOTE_REQUIRED.includes(a) || a === 'CLOSE') {
      const res = await showPrompt(NOTE_REQUIRED.includes(a) ? 'Alasan (wajib)' : 'Catatan verifikasi (opsional)', ACTIONS[a][0]);
      if (res === null || (NOTE_REQUIRED.includes(a) && !res.trim())) return;
      note = res;
    } else if (a === 'SUBMIT_CLOSE' && !(await showConfirm('Ajukan penutupan? Temuan baru ditutup setelah diverifikasi HO.', 'Ajukan penutupan'))) return;
    await submit(`/api/csms/findings/${f.id}`, { body: { action: a, note } });
  };
  const upload = async () => {
    const fd = new FormData();
    files.forEach((x) => fd.append('files', x));
    if (await submit(`/api/csms/findings/${f.id}/files`, { form: fd })) setFiles([]);
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (await submit(`/api/csms/findings/${f.id}`, { method: 'PUT', body: edit })) setEdit(null);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <Link className="btn btn-ghost btn-sm" href="/csms?tab=verify">← Verifikasi & Tindak Lanjut</Link>
        <Badge value={f.status} />
        {f.late && <Badge value="OVERDUE" label="Terlambat" />}
        <div className="spacer" />
        {f.canEdit && <button className="btn btn-outline btn-sm" onClick={() => setEdit({ source: f.source, requirementId: f.requirementId ?? '', description: f.description, picRole: f.picRole ?? '', picName: f.picName ?? '', dueDate: iso(f.dueDate) ?? '', incidentId: f.incidentId ?? '', incidentActionId: f.incidentActionId ?? '', correctiveAction: f.correctiveAction ?? '' })}><Edit size={15} /> Ubah</button>}
      </div>
      <Card title="Temuan">
        <div className="stack" style={{ gap: 12 }}>
          <div className="pre-line" style={{ fontSize: 15 }}>{f.description}</div>
          <dl className="detail-grid">
            <div><dt>Sumber</dt><dd>{labelOf(f.source)}</dd></div>
            <div><dt>Site</dt><dd>{f.site.code} — {f.site.name}</dd></div>
            <div><dt>Butir CSMS</dt><dd>{r ? <Link href={`/csms/requirements/${r.id}`}>{r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ?? `${r.item?.refCode} (lanjutan)`} · unsur {r.element.number}</Link> : '-'}</dd></div>
            <div><dt>PIC</dt><dd>{[f.picRole ? labelOf(f.picRole) : null, f.picName].filter(Boolean).join(' · ') || '-'}</dd></div>
            <div><dt>Tenggat</dt><dd>{f.dueDate ? `${formatDate(f.dueDate)} ${f.tz}` : '-'}</dd></div>
            <div><dt>Dicatat</dt><dd>{f.createdByName}<div className="muted">{formatDate(f.createdAt)}</div></dd></div>
            {f.verifierName && <div><dt>Verifikator penutupan</dt><dd>{f.verifierName}<div className="muted">{formatDate(f.closedAt)}</div></dd></div>}
            {f.incident && <div><dt>Insiden terkait</dt><dd><Link href={`/incidents?q=${encodeURIComponent(f.incident.number)}`}>{f.incident.number}</Link> · {labelOf(f.incident.status)}{f.incidentActionId && f.incident.actions[0] && <div className="muted">Tindakan: {f.incident.actions[0].description} ({labelOf(f.incident.actions[0].status)})</div>}</dd></div>}
          </dl>
        </div>
      </Card>

      <Card title="Tindakan perbaikan & bukti penyelesaian">
        <div className="stack">
          {f.canWork ? (
            <div className="form-group">
              <label className="form-label">Tindakan perbaikan</label>
              <textarea className="form-input" rows={4} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Uraikan perbaikan yang dilakukan" />
              <button className="btn btn-outline btn-sm" style={{ width: 'fit-content', marginTop: 8 }} disabled={busy || action === (f.correctiveAction ?? '')} onClick={() => submit(`/api/csms/findings/${f.id}`, { method: 'PUT', body: { correctiveAction: action } })}><Save size={14} /> Simpan tindakan</button>
            </div>
          ) : <div className="pre-line">{f.correctiveAction || <span className="muted">Belum diisi.</span>}</div>}
          <FileLinks files={f.files} />
          {f.canWork && (
            <div className="form-grid">
              <FileInput label="Bukti penyelesaian (unggahan tidak menutup temuan)" onChange={(x) => setFiles(x)} />
              {files.length > 0 && <button className="btn btn-outline btn-sm" style={{ width: 'fit-content' }} disabled={busy} onClick={upload}>Unggah {files.length} file</button>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f.actions.map((a) => {
              const [label, Icon, cls] = ACTIONS[a];
              return <button key={a} className={`btn btn-sm ${cls}`} disabled={busy} onClick={() => run(a)}><Icon size={15} /> {label}</button>;
            })}
            {!f.actions.length && <span className="muted">{f.status === 'DIAJUKAN_TUTUP' ? 'Menunggu verifikasi HO.' : f.status === 'DITUTUP' ? 'Temuan sudah ditutup.' : 'Tidak ada tindakan untuk peran Anda.'}</span>}
          </div>
        </div>
      </Card>

      <Card title="Riwayat" padding={0}>
        <DataTable rows={f.history} columns={[
          { key: 'at', label: 'Waktu', render: (h) => new Date(h.createdAt).toLocaleString('id-ID') },
          { key: 'a', label: 'Langkah', render: (h) => STEP[h.action] ?? h.action },
          { key: 's', label: 'Status', render: (h) => <Badge value={h.toStatus} /> },
          { key: 'by', label: 'Oleh', render: (h) => h.actorName },
          { key: 'n', label: 'Catatan', render: (h) => h.note ?? '-' },
        ]} />
      </Card>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Ubah temuan" size="modal-lg">
        {edit && (
          <form onSubmit={saveEdit} className="stack">
            <FormFields values={edit} setValues={setEdit} fields={[
              { name: 'source', label: 'Sumber', type: 'select', noEmpty: true, options: FINDING_SOURCES.map((s) => [s, labelOf(s)]) },
              { name: 'dueDate', label: `Tenggat (${f.tz})`, type: 'date' },
              { name: 'picRole', label: 'PIC (bagian)', type: 'select', options: PIC_ROLES.map((x) => [x, labelOf(x)]) },
              { name: 'picName', label: 'Nama PIC' },
              { name: 'description', label: 'Uraian', type: 'textarea', required: true, span: true },
              { name: 'correctiveAction', label: 'Tindakan perbaikan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
