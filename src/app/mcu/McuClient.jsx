'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, GitBranchPlus, ArrowRight } from 'lucide-react';
import { Badge, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { firstStage, MCU_RESULTS, MCU_STAGES, MCU_STAGE_LABELS, MCU_TYPES, MCU_TYPE_LABELS, nextStage, planMcu, reachedFields, stepFields } from '@/lib/domain/mcu';

const EMPTY = { personnelId: '', type: 'PRE_EMPLOYMENT', clinic: '', screeningDate: todayIso(), mcuDate: todayIso(), cost: '', parentId: '' };
const RESULT_OPTIONS = [['FIT', 'FIT'], ['FOLLOW_UP', 'FOLLOW UP'], ['UNFIT', 'UNFIT']];
const EVENT_DATES = ['mcuDate', 'resultDate', 'submitDate', 'feedbackDate'];

// Definisi isian MCU; tiap tahap hanya menampilkan isiannya sendiri (lihat stepFields/reachedFields).
const fieldDefs = (cfg, v) => ({
  clinic: { name: 'clinic', label: 'Klinik', required: true },
  cost: { name: 'cost', label: 'Biaya (Rp)', type: 'number', min: 0 },
  screeningDate: { name: 'screeningDate', label: 'Tgl screening', type: 'date', required: true },
  mcuDate: { name: 'mcuDate', label: 'Tgl MCU', type: 'date', required: true, min: v.screeningDate || undefined, max: todayIso() },
  resultDate: { name: 'resultDate', label: 'Tgl hasil keluar', type: 'date', required: true, min: v.mcuDate || undefined, max: todayIso() },
  result: { name: 'result', label: 'Hasil', type: 'select', options: RESULT_OPTIONS, required: true },
  fuDueDate: { name: 'fuDueDate', label: 'Batas Follow Up', type: 'date', hidden: (x) => x.result !== 'FOLLOW_UP', hint: 'Kosongkan untuk estimasi otomatis.' },
  validUntil: { name: 'validUntil', label: 'MCU annual berikutnya', type: 'date', hidden: (x) => x.result !== 'FIT', hint: `Kosongkan: otomatis ${cfg.annualMonths} bulan dari tgl MCU.` },
  submitDate: { name: 'submitDate', label: 'Tgl submit hasil', type: 'date', required: true, min: v.resultDate || undefined, max: todayIso() },
  feedbackDate: { name: 'feedbackDate', label: 'Tgl feedback', type: 'date', required: true, min: v.submitDate || undefined, max: todayIso() },
  feedback: { name: 'feedback', label: 'Feedback owner/klinik', type: 'textarea', span: true },
  notes: { name: 'notes', label: 'Catatan medis (terenkripsi)', type: 'textarea', span: true },
});

function DueBadge({ due, label }) {
  if (!due) return null;
  if (due.state === 'OVERDUE') return <span className="badge badge-danger">{label} lewat {Math.abs(due.left)} hari</span>;
  if (due.state === 'DUE_SOON') return <span className="badge badge-warning">{label} {due.left} hari lagi</span>;
  return null;
}

export default function McuClient({ sites, data, page, canEdit, preselect }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(preselect && canEdit ? { ...EMPTY, personnelId: preselect } : null);
  const [step, setStep] = useState(null);
  const [files, setFiles] = useState([]);
  const [detail, setDetail] = useState(null);
  const cfg = data.cfg;
  const d = (row, k) => iso(row[k]) ?? '';

  // Input MCU baru: hanya data tahap pertama. Tahap berikutnya diisi bertahap lewat "Lanjut".
  const openNew = () => { setFiles([]); setForm({ ...EMPTY }); };

  // Koreksi data tahap yang sudah dilalui (tahap tidak bisa diubah).
  const openEdit = (row) => {
    setFiles([]);
    const keys = reachedFields(row.stage).filter((k) => k !== 'notes' || row.canMedical);
    const vals = Object.fromEntries(keys.map((k) => [k, ['clinic', 'feedback', 'notes'].includes(k) ? row[k] ?? '' : k === 'cost' ? row.cost ?? '' : k === 'result' ? (row.result === 'PENDING' ? '' : row.result) : d(row, k)]));
    setForm({ id: row.id, personName: row.personnel.name, stage: row.stage, keys, ...vals });
  };

  const openStep = (row) => {
    setFiles([]);
    setDetail(null);
    const to = nextStage(row);
    const keys = stepFields(row.stage, to).filter((k) => k !== 'notes' || row.canMedical);
    const vals = Object.fromEntries(keys.map((k) => [k, EVENT_DATES.includes(k) ? (d(row, k) && d(row, k) <= todayIso() ? d(row, k) : todayIso()) : '']));
    setStep({ id: row.id, personName: row.personnel.name, from: row.stage, to, keys, screeningDate: d(row, 'screeningDate'), mcuDate: d(row, 'mcuDate'), resultDate: d(row, 'resultDate'), submitDate: d(row, 'submitDate'), ...vals });
  };

  const followUp = (row) => {
    setFiles([]);
    setDetail(null);
    setForm({ ...EMPTY, personnelId: row.personnelId, personName: row.personnel.name, type: 'FOLLOW_UP', parentId: row.id, clinic: row.clinic });
  };

  const send = async (url, body, method = 'POST') => {
    const fd = new FormData();
    fd.set('data', JSON.stringify(body));
    files.forEach((f) => fd.append('files', f));
    return submit(url, { method, form: fd });
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.id) {
      if (await send(`/api/mcu/${form.id}`, Object.fromEntries(form.keys.map((k) => [k, form[k]])), 'PUT')) setForm(null);
      return;
    }
    const dateKey = firstStage(form.type) === 'SCREENING' ? 'screeningDate' : 'mcuDate';
    const body = { personnelId: form.personnelId, type: form.type, clinic: form.clinic, cost: form.cost, [dateKey]: form[dateKey], ...(form.parentId ? { parentId: form.parentId } : {}) };
    if (await send('/api/mcu', body)) setForm(null);
  };

  const saveStep = async (e) => {
    e.preventDefault();
    const body = { stage: step.to, ...Object.fromEntries(step.keys.map((k) => [k, step[k]])) };
    if (await send(`/api/mcu/${step.id}/advance`, body)) setStep(null);
  };

  const defs = (v) => fieldDefs(cfg, v);
  const plan = form && !form.id ? planMcu(form.screeningDate || form.mcuDate || todayIso(), cfg.durations) : null;

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari personel' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'type', label: 'Jenis', type: 'select', options: MCU_TYPES.map((t) => [t, MCU_TYPE_LABELS[t]]) },
        { name: 'result', label: 'Hasil', type: 'select', options: MCU_RESULTS },
        { name: 'stage', label: 'Tahap', type: 'select', options: MCU_STAGES.map((s) => [s, MCU_STAGE_LABELS[s]]) },
        { name: 'due', label: 'Pengingat', type: 'select', options: [['annual', `Annual ≤ ${cfg.thresholds.mcuAnnual} hari`], ['fu', `Follow Up ≤ ${cfg.thresholds.followUp} hari`]] },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Input MCU</button>}
      </FilterBar>

      <div className="notice info">
        Estimasi alur (draft parameter): screening {cfg.durations.screening} hari → MCU {cfg.durations.mcu} hari → tunggu hasil {cfg.durations.waitResult} hari → submit → feedback {cfg.durations.feedbackMin}–{cfg.durations.feedbackMax} hari → FU {cfg.durations.followUp} hari jika perlu → mobilisasi {cfg.durations.mobilization} hari. Durasi hanya perencanaan; keputusan kesehatan oleh tenaga/pihak berwenang.
      </div>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={setDetail} empty="Belum ada data MCU."
          columns={[
            { key: 'p', label: 'Personel', render: (r) => (<div><strong>{r.personnel.name}</strong><div className="muted">{r.personnel.code} · {r.site?.code ?? '-'}</div></div>) },
            { key: 'type', label: 'Jenis', render: (r) => MCU_TYPE_LABELS[r.type] },
            { key: 'clinic', label: 'Klinik' },
            { key: 'date', label: 'Tgl MCU', render: (r) => formatDate(r.mcuDate ?? r.screeningDate) },
            { key: 'stage', label: 'Tahap', render: (r) => <Badge value={r.stage} label={MCU_STAGE_LABELS[r.stage]} /> },
            { key: 'result', label: 'Hasil', render: (r) => (<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}><Badge value={r.result} />{!r.isLatest && <span className="chip">riwayat</span>}</div>) },
            { key: 'due', label: 'Jatuh tempo', render: (r) => (<div><div>{r.result === 'FOLLOW_UP' ? 'FU: ' + formatDate(r.fuDueDate) : formatDate(r.validUntil)}</div><DueBadge due={r.annualDue} label="Annual" /><DueBadge due={r.fuDue} label="FU" /></div>) },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `MCU ${MCU_TYPE_LABELS[detail.type]} — ${detail.personnel.name}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <div className="stepper">
              {MCU_STAGES.map((s) => {
                const idx = MCU_STAGES.indexOf(detail.stage);
                const i = MCU_STAGES.indexOf(s);
                return <span key={s} className={`step ${i < idx ? 'done' : i === idx ? 'current' : ''}`}>{MCU_STAGE_LABELS[s]}</span>;
              })}
            </div>
            <dl className="detail-grid">
              <div><dt>Klinik</dt><dd>{detail.clinic}</dd></div>
              <div><dt>Screening</dt><dd>{formatDate(detail.screeningDate)}</dd></div>
              <div><dt>MCU</dt><dd>{formatDate(detail.mcuDate)}</dd></div>
              <div><dt>Hasil keluar</dt><dd>{formatDate(detail.resultDate)}</dd></div>
              <div><dt>Submit</dt><dd>{formatDate(detail.submitDate)}</dd></div>
              <div><dt>Feedback</dt><dd>{formatDate(detail.feedbackDate)}</dd></div>
              <div><dt>Hasil</dt><dd><Badge value={detail.result} /></dd></div>
              <div><dt>Batas FU</dt><dd>{formatDate(detail.fuDueDate)}</dd></div>
              <div><dt>MCU annual berikutnya</dt><dd>{formatDate(detail.validUntil)}</dd></div>
              <div><dt>Biaya</dt><dd>{detail.cost ? new Intl.NumberFormat('id-ID').format(detail.cost) : '-'}</dd></div>
              <div><dt>Feedback owner/klinik</dt><dd>{detail.feedback ?? '-'}</dd></div>
              <div><dt>Catatan medis</dt><dd>{detail.notes ?? '-'}</dd></div>
            </dl>
            <div>
              <div className="section-title">Estimasi rencana</div>
              <div className="stepper">{detail.plan.map((p) => <span key={p.stage} className="step">{MCU_STAGE_LABELS[p.stage]}: {formatDate(p.start, { day: 'numeric', month: 'short' })}</span>)}</div>
            </div>
            <div>
              <div className="section-title">Dokumen MCU</div>
              {detail.canMedical ? <FileLinks files={detail.files} /> : <span className="muted">Dokumen medis dibatasi.</span>}
            </div>
            <div className="row-actions">
              <Link className="btn btn-ghost btn-sm" href={'/personnel/' + detail.personnelId}>Profil personel</Link>
              {canEdit && detail.result === 'FOLLOW_UP' && <button className="btn btn-outline btn-sm" onClick={() => followUp(detail)}><GitBranchPlus size={15} /> Catat hasil Follow Up</button>}
              {canEdit && <button className="btn btn-outline btn-sm" onClick={() => { setDetail(null); openEdit(detail); }}><Edit size={15} /> Koreksi data</button>}
              {canEdit && nextStage(detail) && <button className="btn btn-primary btn-sm" onClick={() => openStep(detail)}><ArrowRight size={15} /> Lanjut ke {MCU_STAGE_LABELS[nextStage(detail)]}</button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Koreksi data MCU — ${form.personName}` : form?.parentId ? `Follow Up — ${form.personName}` : 'Input MCU'}
        subtitle={form?.id ? `Tahap saat ini: ${MCU_STAGE_LABELS[form.stage]}. Hanya data tahap yang sudah dilalui yang bisa dikoreksi; perubahan dicatat di audit log.` : 'Isi data tahap pertama. Tahap berikutnya diisi bertahap dari detail MCU (tombol Lanjut).'} size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            {form.id ? (
              <FormFields values={form} setValues={setForm} fields={form.keys.map((k) => defs(form)[k])} />
            ) : (
              <FormFields values={form} setValues={setForm} fields={[
                ...(form.parentId ? [] : [{ name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true }]),
                { name: 'type', label: 'Jenis MCU', type: 'select', options: MCU_TYPES.filter((t) => (form.parentId ? t === 'FOLLOW_UP' : t !== 'FOLLOW_UP')).map((t) => [t, MCU_TYPE_LABELS[t]]), required: true, noEmpty: true, hint: 'Pre-Employment dimulai dari screening; jenis lain langsung dari tanggal MCU.' },
                defs(form).clinic,
                firstStage(form.type) === 'SCREENING' ? defs(form).screeningDate : { ...defs({}).mcuDate, min: undefined },
                defs(form).cost,
              ]} />
            )}
            {form.id && form.keys.includes('notes') && <div className="form-grid"><FileInput label="Dokumen hasil MCU (privat)" onChange={setFiles} /></div>}
            {plan && (
              <div className="notice info">
                Estimasi siap mobilisasi: <strong>{formatDate(plan.readyDate)}</strong> ({plan.totalDays} hari dari {firstStage(form.type) === 'SCREENING' ? 'screening' : 'MCU'}).
              </div>
            )}
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(step)} onClose={() => setStep(null)} title={step ? `${MCU_STAGE_LABELS[step.from]} → ${MCU_STAGE_LABELS[step.to]} — ${step.personName}` : ''}
        subtitle={step && !step.keys.length ? `Konfirmasi bahwa tahap ${MCU_STAGE_LABELS[step.from]} sudah selesai.` : 'Isi data tahap ini. Tanggal tidak boleh setelah hari ini atau sebelum tahap sebelumnya.'}>
        {step && (
          <form onSubmit={saveStep} className="stack">
            <div className="stepper">
              {MCU_STAGES.map((s) => {
                const i = MCU_STAGES.indexOf(s);
                const idx = MCU_STAGES.indexOf(step.to);
                return <span key={s} className={`step ${i < idx ? 'done' : i === idx ? 'current' : ''}`}>{MCU_STAGE_LABELS[s]}</span>;
              })}
            </div>
            {step.keys.length > 0 && <FormFields values={step} setValues={setStep} fields={step.keys.map((k) => defs(step)[k])} />}
            {step.keys.includes('result') && <div className="form-grid"><FileInput label="Dokumen hasil MCU (privat)" onChange={setFiles} /></div>}
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : `Simpan & lanjut ke ${MCU_STAGE_LABELS[step.to]}`}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
