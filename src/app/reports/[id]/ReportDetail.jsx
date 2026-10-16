'use client';

import { useState } from 'react';
import { Printer, Download, Send, CheckCheck, Undo2, Save } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { reportTransition } from '@/lib/access';
import { formatDate, iso } from '@/lib/dates';
import { fmtNum, labelOf } from '@/lib/labels';

const ACTIONS = [
  ['SUBMIT', 'Kirim ke PJO/PM', Send, 'btn-primary'],
  ['REVIEW', 'Tandai sudah diperiksa', CheckCheck, 'btn-primary'],
  ['RETURN_REVIEW', 'Kembalikan untuk revisi', Undo2, 'btn-outline'],
  ['APPROVE', 'Sahkan laporan', CheckCheck, 'btn-primary'],
  ['RETURN_APPROVE', 'Kembalikan untuk revisi', Undo2, 'btn-outline'],
];

export default function ReportDetail({ report: r, user }) {
  const { submit, busy } = useSubmit();
  const { showPrompt } = useDialog();
  const editable = ['DRAFT', 'REVISION'].includes(r.status) && ['HSE_SITE', 'HO_HSE'].includes(user.role);
  const [text, setText] = useState({ narrative: r.narrative ?? '', constraints: r.constraints ?? '', nextPlan: r.nextPlan ?? '', incidentNote: r.incidentNote ?? '' });
  const [files, setFiles] = useState([]);
  const s = r.summary;

  const save = async () => {
    const fd = new FormData();
    fd.set('data', JSON.stringify(text));
    files.forEach((f) => fd.append('files', f));
    return submit(`/api/reports/${r.id}`, { method: 'PUT', form: fd });
  };

  const run = async (action) => {
    const needsNote = action.startsWith('RETURN');
    const note = await showPrompt(needsNote ? 'Catatan revisi (wajib)' : 'Catatan (opsional)', ACTIONS.find((a) => a[0] === action)[1]);
    if (note === null || (needsNote && !note.trim())) return;
    if (action === 'SUBMIT' && editable && !(await save())) return;
    await submit(`/api/reports/${r.id}/transition`, { body: { action, note } });
  };

  const area = (key, label, rows = 4) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {editable ? <textarea className="form-input" rows={rows} value={text[key]} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
        : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{r[key] || '-'}</div>}
    </div>
  );

  return (
    <div className="stack">
      <div className="toolbar no-print">
        <Badge value={r.status} />
        {r.live && <span className="chip">Ringkasan memakai data terkini</span>}
        <div className="spacer" />
        <a className="btn btn-outline btn-sm" href={`/api/reports/${r.id}/export`}><Download size={15} /> Excel</a>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={15} /> PDF / cetak</button>
        {editable && <button className="btn btn-outline btn-sm" disabled={busy} onClick={save}><Save size={15} /> Simpan draft</button>}
        {ACTIONS.filter(([a]) => reportTransition(user.role, a, r.status)).map(([a, label, Icon, cls]) => (
          <button key={a} className={`btn btn-sm ${cls}`} disabled={busy} onClick={() => run(a)}><Icon size={15} /> {label}</button>
        ))}
      </div>
      <div className="notice no-print">Format cetak final perlu dicocokkan dengan contoh laporan resmi PJM.</div>

      <Card title="1. Identitas">
        <dl className="detail-grid">
          <div><dt>Site</dt><dd>{s.identity.siteCode} — {s.identity.siteName}</dd></div>
          <div><dt>Proyek</dt><dd>{s.identity.projects.map((p) => p.name).join('; ') || '-'}</dd></div>
          <div><dt>Owner</dt><dd>{s.identity.projects.map((p) => p.owner).join('; ') || '-'}</dd></div>
          <div><dt>Jenis / periode</dt><dd>{labelOf(r.type)} · {formatDate(s.period.start)} – {formatDate(s.period.end)}</dd></div>
          <div><dt>Penanggung jawab HSE</dt><dd>{s.identity.responsibles.HSE_SITE ?? r.creatorName}</dd></div>
          <div><dt>PJO / PM</dt><dd>{[s.identity.responsibles.PJO, s.identity.responsibles.PM].filter(Boolean).join(' / ') || '-'}</dd></div>
          {r.dueDate && <div><dt>Batas pengiriman</dt><dd>{formatDate(r.dueDate)}</dd></div>}
          <div><dt>Versi</dt><dd>{r.version}</dd></div>
        </dl>
      </Card>

      <Card title="2. Ringkasan">
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          <div className="kpi-card navy"><div className="kpi-label">Manpower terdaftar / rata-rata</div><div className="kpi-value">{fmtNum(s.manpower.registered)} / {fmtNum(s.manpower.average)}</div></div>
          <div className="kpi-card orange"><div className="kpi-label">Manhours</div><div className="kpi-value">{fmtNum(s.manhours)}</div></div>
          <div className="kpi-card green"><div className="kpi-label">Safe manhours</div><div className="kpi-value">{fmtNum(s.safeManhours)}</div></div>
          <div className="kpi-card red"><div className="kpi-label">Kejadian</div><div className="kpi-value">{fmtNum(Object.values(s.incidents).reduce((a, b) => a + b, 0))}</div><div className="kpi-trend flat">LTIFR {fmtNum(s.ltifr, 2)} (draft)</div></div>
        </div>
        <div className="grid-2" style={{ marginTop: 16 }}>
          <DataTable rows={s.activities} rowKey={(a) => a.code} empty="Tidak ada aktivitas." columns={[{ key: 'name', label: 'Aktivitas HSE' }, { key: 'count', label: 'Jumlah', num: true }, { key: 'participants', label: 'Peserta', num: true, render: (a) => a.participants || '-' }]} />
          <DataTable rows={Object.entries(s.incidents).map(([k, v]) => ({ k, v }))} rowKey={(x) => x.k} empty="Tidak ada kejadian." columns={[{ key: 'k', label: 'Kategori kejadian', render: (x) => labelOf(x.k) }, { key: 'v', label: 'Jumlah', num: true }]} />
        </div>
      </Card>

      <Card title="3. Rincian aktivitas" padding={0}>
        <DataTable rows={s.activityDetail} empty="Tidak ada aktivitas tercatat." columns={[
          { key: 'date', label: 'Tanggal', render: (a) => formatDate(a.date) },
          { key: 'name', label: 'Kegiatan', render: (a) => (<div>{a.name}{a.title && <div className="muted">{a.title}</div>}</div>) },
          { key: 'participants', label: 'Peserta', num: true, render: (a) => a.participants ?? '-' },
          { key: 'doc', label: 'Dokumentasi', render: (a) => (r.activityFiles[a.id]?.length ? <FileLinks files={r.activityFiles[a.id]} /> : '-') },
        ]} />
        <div style={{ padding: 16 }}>{area('narrative', 'Ringkasan aktivitas')}</div>
      </Card>

      <Card title="4. Kejadian dan tindak lanjut" padding={0}>
        <DataTable rows={s.incidentDetail} rowKey={(i) => i.number} empty="Tidak ada kejadian pada periode ini." columns={[
          { key: 'number', label: 'Nomor' },
          { key: 'date', label: 'Tanggal', render: (i) => formatDate(i.occurredAt) },
          { key: 'cat', label: 'Kategori', render: (i) => <Badge value={i.category} /> },
          { key: 'title', label: 'Ringkasan' },
          { key: 'status', label: 'Status', render: (i) => <Badge value={i.status} /> },
          { key: 'act', label: 'Tindak lanjut (PIC, tenggat)', render: (i) => i.actions.map((a) => `${a.description} — ${a.pic}${a.dueDate ? ', ' + formatDate(a.dueDate) : ''} [${labelOf(a.status)}]`).join('; ') || '-' },
        ]} />
        <div style={{ padding: 16 }}>{area('incidentNote', 'Catatan kejadian', 3)}</div>
      </Card>

      <Card title="5. Kendala dan rencana periode berikutnya">
        <div className="grid-2">{area('constraints', 'Kendala')}{area('nextPlan', 'Rencana kerja periode berikutnya')}</div>
      </Card>

      <Card title="Lampiran foto">
        <FileLinks files={r.files} />
        {editable && <div className="form-grid no-print" style={{ marginTop: 12 }}><FileInput label="Tambah foto laporan" accept="image/*,.pdf" onChange={setFiles} /></div>}
      </Card>

      <Card title="6. Pemeriksaan & pengesahan">
        <div className="grid-2">
          <div className="card" style={{ padding: 16 }}>
            <div className="section-title">Diperiksa PJO / PM</div>
            <dl className="detail-grid">
              <div><dt>Nama</dt><dd>{r.reviewerName ?? '-'}</dd></div>
              <div><dt>Waktu</dt><dd>{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString('id-ID') : '-'}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Catatan</dt><dd>{r.reviewNote ?? '-'}</dd></div>
            </dl>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="section-title">Disahkan HSE HO</div>
            <dl className="detail-grid">
              <div><dt>Nama</dt><dd>{r.approvedAt ? r.approverName : '-'}</dd></div>
              <div><dt>Waktu</dt><dd>{r.approvedAt ? new Date(r.approvedAt).toLocaleString('id-ID') : '-'}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Catatan</dt><dd>{r.approveNote ?? '-'}</dd></div>
            </dl>
          </div>
        </div>
      </Card>

      <Card title="Riwayat & catatan revisi" padding={0}>
        <DataTable rows={r.history} columns={[
          { key: 'at', label: 'Waktu', render: (h) => new Date(h.createdAt).toLocaleString('id-ID') },
          { key: 'version', label: 'Versi', num: true },
          { key: 'action', label: 'Aksi', render: (h) => ({ CREATE: 'Dibuat', SUBMIT: 'Dikirim', REVIEW: 'Diperiksa', REVISION: 'Dikembalikan', APPROVE: 'Disahkan (arsip)' })[h.action] ?? h.action },
          { key: 'actorName', label: 'Oleh' },
          { key: 'note', label: 'Catatan', render: (h) => h.note ?? '-' },
        ]} />
      </Card>
      <div className="muted">Dicetak {formatDate(iso(new Date()))} dari E-HSE PJM.</div>
    </div>
  );
}
