'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Save, Send, CheckCheck, Undo2, RotateCcw, Upload, Link2, FileText, Unlink, AlertTriangle, ExternalLink, Database } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { EDITABLE } from '@/lib/domain/csms';
import { CSMS_STATUS, RESP_LABELS, StatusBadge, freqLabel, picLabel } from '../../shared';

const ACTIONS = {
  SAVE: ['Simpan draft', Save, 'btn-outline'],
  SUBMIT: ['Ajukan', Send, 'btn-primary'],
  REVISE: ['Ubah bukti (perlu diperiksa ulang)', RotateCcw, 'btn-outline'],
  REVIEW: ['Tandai sudah diperiksa', CheckCheck, 'btn-primary'],
  RETURN: ['Kembalikan untuk revisi', Undo2, 'btn-outline'],
  VERIFY: ['Verifikasi', CheckCheck, 'btn-primary'],
  REOPEN: ['Buka ulang', Undo2, 'btn-outline'],
};
const NOTE_REQUIRED = ['RETURN', 'REOPEN'];
const OUTCOME = { PENDING: 'Menunggu', REVIEWED: 'Diperiksa PJO/PM', RETURNED: 'Dikembalikan', VERIFIED: 'Terverifikasi', SUPERSEDED: 'Digantikan versi baru' };

export default function RequirementDetail({ data }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const r = data.requirement;
  const app = r.application;
  const cur = data.current;
  const status = data.status;
  const editable = data.canFill && EDITABLE.includes(status);
  const [note, setNote] = useState(cur?.note ?? '');
  const [upload, setUpload] = useState(null);
  const [files, setFiles] = useState([]);
  const [picker, setPicker] = useState(null);
  const today = data.today ?? todayIso();
  const overdue = cur?.dueDate && !['VERIFIED', 'SUBMITTED', 'REVIEWED'].includes(status) && iso(cur.dueDate) < today;
  const go = (key) => key && router.push(`/csms/requirements/${r.id}?period=${encodeURIComponent(key)}`);

  const run = async (action) => {
    let n = action === 'SAVE' || action === 'SUBMIT' ? note : '';
    if (action === 'REVISE' && !(await showConfirm('Status kembali ke Draft dan butir harus diajukan serta diverifikasi ulang. Riwayat verifikasi sebelumnya tetap tersimpan.', 'Ubah bukti terverifikasi'))) return;
    if (['REVIEW', 'RETURN', 'VERIFY', 'REOPEN'].includes(action)) {
      const res = await showPrompt(NOTE_REQUIRED.includes(action) ? 'Catatan revisi (wajib)' : 'Catatan pemeriksaan (opsional)', ACTIONS[action][0]);
      if (res === null || (NOTE_REQUIRED.includes(action) && !res.trim())) return;
      n = res;
    }
    await submit(`/api/csms/requirements/${r.id}/fulfillment`, { body: { periodKey: data.periodKey, action, note: n } });
  };

  const saveUpload = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...upload, periodKey: data.periodKey }));
    files.forEach((f) => fd.append('files', f));
    if (await submit(`/api/csms/requirements/${r.id}/evidence`, { form: fd })) { setUpload(null); setFiles([]); }
  };
  const link = async (payload) => {
    if (await submit(`/api/csms/requirements/${r.id}/evidence`, { body: { periodKey: data.periodKey, ...payload } })) setPicker(null);
  };
  const unlink = async (ev) => {
    if (await showConfirm(`Lepas "${ev.title}" dari periode ini? File/dokumen tetap tersimpan.`, 'Lepas bukti')) await submit(`/api/csms/fulfillments/${cur.id}/evidence/${ev.id}`, { method: 'DELETE' });
  };
  const requestNa = async () => {
    const reason = await showPrompt('Alasan butir ini tidak berlaku di site (wajib). Berlaku setelah disetujui HO.', 'Usulkan N/A');
    if (reason?.trim()) await submit(`/api/csms/requirements/${r.id}`, { method: 'PUT', body: { action: 'REQUEST_NA', reason } });
  };

  return (
    <div className="stack">
      <Card title="Persyaratan" actions={<>
        {data.canManage && <Link className="btn btn-outline btn-sm" href={`/csms/applications/${app.id}`}>Atur persyaratan site</Link>}
        {data.canFill && r.applicability === 'APPLICABLE' && !data.canManage && <button className="btn btn-outline btn-sm" disabled={busy} onClick={requestNa}>Usulkan N/A</button>}
      </>}>
        <div className="stack" style={{ gap: 12 }}>
          {r.item?.subHeader && <div className="muted">{r.item.subHeader}</div>}
          <div style={{ fontSize: 16, fontWeight: 500 }}>{r.text}</div>
          {r.item?.displayText && r.item.displayText !== r.item.sourceText && <div className="muted">Kutipan sumber: “{r.item.sourceText}”</div>}
          {r.applicability !== 'APPLICABLE' && <div className="notice"><strong>{CSMS_STATUS[r.applicability]}</strong> — {r.naReason}{r.naDecidedByName ? ` (diputuskan ${r.naDecidedByName})` : ''}</div>}
          <dl className="detail-grid">
            <div><dt>Kode sumber / ID internal</dt><dd>{r.code} · {r.item?.internalCode ?? r.code}</dd></div>
            <div><dt>Unsur</dt><dd>{r.element.number}. {r.element.name}</dd></div>
            <div><dt>Acuan owner & versi template</dt><dd>{app.template.sourceDocCode} · {app.template.code} v{app.template.version}<div className="muted">{app.template.ownerName}</div></dd></div>
            <div><dt>{r.origin === 'SITE_ADDITION' ? 'Acuan butir tambahan' : 'Nilai maksimum (assessment)'}</dt><dd>{r.origin === 'SITE_ADDITION' ? r.sourceRef : r.item?.maxScore ?? '-'}</dd></div>
            <div><dt>Penanggung jawab</dt><dd>{RESP_LABELS[r.responsibility]}</dd></div>
            <div><dt>PIC utama / pendukung</dt><dd>{picLabel(r)}{r.supportRoles && <div className="muted">Pendukung: {r.supportRoles}</div>}</dd></div>
            <div><dt>Frekuensi</dt><dd>{freqLabel(r.frequency)}</dd></div>
            <div><dt>Aturan tenggat</dt><dd>{r.frequency === 'ONCE' ? (r.dueDate ? formatDate(r.dueDate) : 'Belum ditetapkan') : r.dueDays !== null && r.dueDays !== undefined ? `${r.dueDays} hari setelah akhir periode` : 'Belum ditetapkan'}</dd></div>
            {r.ownerReference && <div><dt>Acuan owner khusus site</dt><dd>{r.ownerReference}</dd></div>}
          </dl>
          {(r.evidenceGuide || r.item?.evidenceGuide) && <div className="notice info"><strong>Petunjuk bukti:</strong> {r.evidenceGuide ?? r.item.evidenceGuide}</div>}
        </div>
      </Card>

      {data.masterDocs.length > 0 && (
        <Card title="Dokumen induk HO terkait" padding={0}>
          <DataTable rows={data.masterDocs} columns={[
            { key: 'n', label: 'Nomor', render: (d) => (<div><strong>{d.number}</strong><div className="muted">Rev {d.revision}</div></div>) },
            { key: 't', label: 'Judul', render: (d) => d.title },
            { key: 'f', label: '', render: (d) => (
              <div className="row-actions">
                {d.versions[0] && <a className="btn btn-ghost btn-sm" href={`/api/files/${d.versions[0].fileId}`}>Unduh</a>}
                {editable && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => link({ documentId: d.id })}><Link2 size={14} /> Tautkan sebagai bukti</button>}
              </div>
            ) },
          ]} />
        </Card>
      )}

      <Card title={`Periode ${data.periodKey ?? '-'}`} actions={<PeriodPicker r={r} value={data.periodKey} history={data.history} onChange={go} />}>
        {!data.periodKey ? (
          <p className="muted">Pilih tanggal kejadian/perubahan untuk mencatat bukti.</p>
        ) : (
          <div className="stack">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge value={status} />
              {cur?.version > 0 && <span className="muted">Pengajuan versi {cur.version}</span>}
              {data.period && data.periodKey !== 'AWAL' && <span className="muted">{formatDate(data.period.start)} – {formatDate(data.period.end)}</span>}
              <span className="muted">Tenggat: {cur?.dueDate ? `${formatDate(cur.dueDate)} ${data.tz}` : 'belum ditetapkan'}</span>
              {overdue && <Badge value="OVERDUE" />}
              {cur?.verifiedAt && <span className="muted">Terverifikasi {formatDate(cur.verifiedAt)} oleh {cur.verifiedByName}</span>}
            </div>
            {cur?.reviewNote && status === 'REVISION' && <div className="notice danger"><strong>Catatan revisi:</strong> {cur.reviewNote}</div>}
            {cur?.evidence?.some((e) => e.changedSinceVerified) && <div className="notice"><AlertTriangle size={15} /> Dokumen bukti telah direvisi setelah verifikasi. Pilih “Ubah bukti” agar diperiksa ulang.</div>}

            <div>
              <div className="section-title">Bukti pelaksanaan</div>
              {!cur?.evidence?.length ? <p className="muted">Belum ada bukti untuk periode ini.</p> : (
                <DataTable rows={cur.evidence} columns={[
                  { key: 't', label: 'Bukti', render: (e) => (<div><strong>{e.title}</strong>{e.description && <div className="cell-sub">{e.description}</div>}</div>) },
                  { key: 'k', label: 'Jenis', render: (e) => (e.source ? e.source.label : { FILE: 'File', DOCUMENT: 'Dokumen HSE' }[e.kind]) },
                  { key: 'f', label: 'Berkas', render: (e) => (e.source ? (e.source.link ? <a href={e.source.link}><ExternalLink size={13} /> Buka sumber</a> : '-') : e.file ? <a href={`/api/files/${e.file.id}`}>{e.file.fileName}</a> : e.document ? (<span><a href={e.document.fileId ? `/api/files/${e.document.fileId}` : '/documents'}>{e.document.number} rev {e.document.revision}</a>{e.changedSinceVerified && <div><Badge value="REVISION" label="Direvisi setelah verifikasi" /></div>}</span>) : '-') },
                  { key: 'v', label: 'Berlaku s/d', render: (e) => (e.validUntil ? <span className={iso(e.validUntil) < today ? 'text-red' : ''}>{formatDate(e.validUntil)}</span> : <span className="muted">-</span>) },
                  { key: 'by', label: 'Ditautkan', render: (e) => (<div>{e.linkedByName}<div className="muted">{formatDate(e.linkedAt)}</div></div>) },
                  { key: 'a', label: '', render: (e) => (editable ? <button className="btn btn-ghost btn-sm" title="Lepas" disabled={busy} onClick={() => unlink(e)}><Unlink size={14} /></button> : null) },
                ]} />
              )}
              {editable && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => { setFiles([]); setUpload({ title: '', description: '', evidenceDate: today, validUntil: '' }); }}><Upload size={15} /> Unggah bukti</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setPicker('evidence')}><Link2 size={15} /> Pakai bukti yang sudah ada</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setPicker('document')}><FileText size={15} /> Tautkan Dokumen HSE</button>
                  <button className={`btn btn-sm ${data.suggestions.length ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPicker('source')}><Database size={15} /> Tautkan data modul</button>
                </div>
              )}
            </div>

            {editable && (
              <div className="form-group">
                <label className="form-label">Catatan pengisi</label>
                <textarea className="form-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keterangan pelaksanaan, kendala, atau tanggapan atas catatan revisi" />
              </div>
            )}
            {!editable && cur?.note && <div><div className="section-title">Catatan pengisi</div><div className="pre-line">{cur.note}</div></div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.actions.map((a) => {
                const [label, Icon, cls] = ACTIONS[a];
                return <button key={a} className={`btn btn-sm ${cls}`} disabled={busy || (a === 'SUBMIT' && !cur?.evidence?.length)} title={a === 'SUBMIT' && !cur?.evidence?.length ? 'Tautkan minimal satu bukti' : ''} onClick={() => run(a)}><Icon size={15} /> {label}</button>;
              })}
              {!data.actions.length && <span className="muted">{status === 'SUBMITTED' ? (app.requireReview ? 'Menunggu pemeriksaan PJO/PM.' : 'Menunggu verifikasi HO.') : status === 'REVIEWED' ? 'Menunggu verifikasi HO.' : 'Tidak ada tindakan untuk peran Anda.'}</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>Verifikasi HO = verifikasi internal PJM, bukan persetujuan owner.</div>
          </div>
        )}
      </Card>

      {cur?.submissions?.length > 0 && (
        <Card title="Riwayat pengajuan & pemeriksaan" padding={0}>
          <DataTable rows={cur.submissions} columns={[
            { key: 'v', label: 'Versi', render: (s) => s.version },
            { key: 'by', label: 'Diajukan', render: (s) => (<div>{s.submittedByName}<div className="muted">{new Date(s.submittedAt).toLocaleString('id-ID')}</div></div>) },
            { key: 'ev', label: 'Bukti saat diajukan', render: (s) => (<ul style={{ margin: 0, paddingLeft: 16 }}>{s.evidence.map((e) => <li key={e.evidenceId}>{e.title}{e.revision ? ` (rev ${e.revision})` : ''}{e.summary ? <div className="muted">{e.summary}</div> : null}</li>)}</ul>) },
            { key: 'rv', label: 'Pemeriksaan PJO/PM', render: (s) => (s.reviewedByName ? <div>{s.reviewedByName}<div className="muted">{s.reviewNote ?? '-'}</div></div> : <span className="muted">-</span>) },
            { key: 'dc', label: 'Keputusan HO', render: (s) => (s.decidedByName ? <div>{s.decidedByName}<div className="muted">{s.decisionNote ?? '-'}</div></div> : <span className="muted">-</span>) },
            { key: 'o', label: 'Hasil', render: (s) => <Badge value={s.outcome === 'PENDING' ? 'SUBMITTED' : s.outcome} label={OUTCOME[s.outcome]} /> },
          ]} />
        </Card>
      )}

      {data.history.length > 0 && (
        <Card title="Periode lain" padding={0}>
          <DataTable rows={data.history} onRowClick={(h) => go(h.periodKey)} columns={[
            { key: 'p', label: 'Periode', render: (h) => (h.periodKey === data.periodKey ? <strong>{h.periodKey}</strong> : h.periodKey) },
            { key: 's', label: 'Status', render: (h) => <StatusBadge value={h.status} /> },
            { key: 'v', label: 'Versi', num: true, render: (h) => h.version },
            { key: 'e', label: 'Bukti', num: true, render: (h) => h.evidenceCount },
            { key: 'd', label: 'Tenggat', render: (h) => formatDate(h.dueDate) },
          ]} />
        </Card>
      )}

      <Modal open={Boolean(upload)} onClose={() => setUpload(null)} title="Unggah bukti" subtitle="Jangan unggah KTP atau dokumen medis rinci; data MCU ditautkan dari modul MCU.">
        {upload && (
          <form onSubmit={saveUpload} className="stack">
            <FormFields values={upload} setValues={setUpload} fields={[
              { name: 'title', label: 'Judul bukti', required: true, span: true, placeholder: 'mis. Daftar hadir sosialisasi kebijakan K3LH' },
              { name: 'evidenceDate', label: 'Tanggal bukti', type: 'date' },
              { name: 'validUntil', label: 'Berlaku sampai', type: 'date', hint: 'Isi bila bukti memiliki masa berlaku.' },
              { name: 'description', label: 'Keterangan', type: 'textarea', span: true },
            ]} />
            <div className="form-grid"><FileInput label="File bukti (boleh beberapa)" onChange={(f) => setFiles(f)} /></div>
            <button className="btn btn-primary" disabled={busy || !files.length}>Unggah & tautkan</button>
          </form>
        )}
      </Modal>
      <Picker kind={picker === 'source' ? null : picker} siteId={app.siteId} onClose={() => setPicker(null)} onPick={link} busy={busy} />
      {picker === 'source' && <SourcePicker open reqId={r.id} periodKey={data.periodKey} onClose={() => setPicker(null)} busy={busy}
        onPick={async (key) => { if (await submit(`/api/csms/requirements/${r.id}/sources`, { body: { periodKey: data.periodKey, key } })) setPicker(null); }} />}
    </div>
  );
}

function PeriodPicker({ r, value, history, onChange }) {
  const f = r.frequency;
  if (f === 'ONCE') return null;
  const keys = [...new Set([...(f === 'CUSTOM' ? r.schedule ?? [] : []), ...history.map((h) => h.periodKey)])];
  const type = { MONTHLY: 'month', WEEKLY: 'week', DAILY: 'date', EVENT: 'date', ON_CHANGE: 'date' }[f];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {f === 'ON_CHANGE' && <button className="btn btn-ghost btn-sm" onClick={() => onChange('AWAL')}>Baseline (awal)</button>}
      {f === 'CUSTOM' ? (
        <select className="form-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      ) : f === 'YEARLY' ? (
        <input className="form-input" type="number" min="2000" max="2099" style={{ width: 110 }} defaultValue={value ?? ''} onBlur={(e) => onChange(e.target.value)} />
      ) : (
        <input className="form-input" type={type} defaultValue={value && value !== 'AWAL' ? value : ''} onChange={(e) => onChange(e.target.value)} aria-label={f === 'EVENT' ? 'Tanggal kejadian' : 'Periode'} />
      )}
    </div>
  );
}

function Picker({ kind, siteId, onClose, onPick, busy }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!kind) return;
    const t = setTimeout(() => {
      const url = kind === 'evidence' ? '/api/csms/evidence' : '/api/csms/linkable-documents';
      fetch(`${url}?${new URLSearchParams({ siteId, q })}`).then((r) => (r.ok ? r.json() : { rows: [] })).then((d) => setRows(d.rows ?? [])).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [kind, siteId, q]);
  return (
    <Modal open={Boolean(kind)} onClose={onClose} title={kind === 'evidence' ? 'Pakai bukti yang sudah ada' : 'Tautkan Dokumen HSE'} subtitle={kind === 'evidence' ? 'Satu bukti dapat dipakai untuk beberapa butir.' : 'Dokumen HO yang boleh diakses site ini dan dokumen site sendiri. Tidak perlu unggah ulang.'} size="modal-lg">
      <div className="stack">
        <input className="form-input" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
        {rows === null ? <div className="loading-block">Memuat…</div> : rows.length === 0 ? <p className="muted">Tidak ada data.</p> : (
          <DataTable rows={rows} columns={kind === 'evidence' ? [
            { key: 't', label: 'Bukti', render: (e) => (<div><strong>{e.title}</strong><div className="muted">{({ FILE: 'File', DOCUMENT: 'Dokumen HSE', SOURCE: 'Data modul lain' })[e.kind]} · {formatDate(e.createdAt)} · dipakai {e._count.links} butir</div></div>) },
            { key: 'v', label: 'Berlaku s/d', render: (e) => formatDate(e.validUntil) },
            { key: 'a', label: '', render: (e) => <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPick({ evidenceId: e.id })}>Tautkan</button> },
          ] : [
            { key: 'n', label: 'Dokumen', render: (d) => (<div><strong>{d.number}</strong> rev {d.revision}<div className="cell-sub">{d.title}</div></div>) },
            { key: 'c', label: 'Kategori', render: (d) => (<div>{labelOf(d.category)}<div className="muted">{d.siteId ? 'Dokumen site' : 'Dokumen HO'}</div></div>) },
            { key: 'a', label: '', render: (d) => <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPick({ documentId: d.id })}>Tautkan</button> },
          ]} />
        )}
        <Link href="/documents" className="muted" style={{ fontSize: 13 }}><ExternalLink size={13} /> Dokumen belum ada? Tambahkan di menu Dokumen HSE.</Link>
      </div>
    </Modal>
  );
}

/** Ringkasan data modul untuk periode butir (dipasang ulang tiap dibuka). Saran sumber tampil lebih dulu. */
function SourcePicker({ open, reqId, periodKey, onClose, onPick, busy }) {
  const [data, setData] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/csms/requirements/${reqId}/sources?${new URLSearchParams({ period: periodKey })}`)
      .then(async (r) => (r.ok ? r.json() : { error: (await r.json().catch(() => ({}))).error ?? 'Gagal memuat data.' }))
      .then(setData).catch(() => setData({ error: 'Gagal memuat data.' }));
  }, [open, reqId, periodKey]);
  const groups = (data?.groups ?? []).filter((g) => all || g.suggested || !data.suggested.length).sort((a, b) => Number(b.suggested) - Number(a.suggested));
  return (
    <Modal open={open} onClose={onClose} title="Tautkan data modul" subtitle={data?.from ? `Data ${data.from} s/d ${data.to}. Ringkasan disimpan sebagai snapshot; tautan sumber mengikuti hak akses modulnya.` : 'Data dari modul E-HSE tanpa input ulang.'} size="modal-lg">
      <div className="stack">
        {!data ? <div className="loading-block">Memuat…</div> : data.error ? <div className="notice danger">{data.error}</div> : (
          <>
            {data.suggested.length > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Tampilkan semua sumber (bukan hanya yang disarankan)
              </label>
            )}
            {groups.map((g) => (
              <div key={g.type}>
                <div className="section-title" style={{ marginBottom: 6 }}>{g.label}{g.suggested && <span className="chip" style={{ marginLeft: 8 }}>Disarankan</span>}</div>
                {g.options.length === 0 ? <p className="muted">Tidak ada data pada periode ini.</p> : (
                  <DataTable rows={g.options} rowKey={(o) => o.key} columns={[
                    { key: 't', label: 'Data', render: (o) => (<div><strong>{o.title}</strong>{o.suggested && g.options.length > 1 && <span className="chip" style={{ marginLeft: 6 }}>Disarankan</span>}<div className="cell-sub">{o.summary}</div></div>) },
                    { key: 'l', label: '', render: (o) => <a className="btn btn-ghost btn-sm" href={o.link} target="_blank" rel="noreferrer">Lihat</a> },
                    { key: 'a', label: '', render: (o) => <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPick(o.key)}>Tautkan</button> },
                  ]} />
                )}
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12.5 }}>Data modul menjadi bukti, bukan keputusan: butir tetap diajukan dan diverifikasi HO.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
