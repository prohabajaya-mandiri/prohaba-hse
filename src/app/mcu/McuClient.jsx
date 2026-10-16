'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, GitBranchPlus } from 'lucide-react';
import { Badge, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { MCU_RESULTS, MCU_STAGES, MCU_STAGE_LABELS, MCU_TYPES, MCU_TYPE_LABELS, planMcu } from '@/lib/domain/mcu';

const EMPTY = { personnelId: '', type: 'PRE_EMPLOYMENT', clinic: '', stage: 'SCREENING', screeningDate: todayIso(), mcuDate: '', resultDate: '', submitDate: '', feedbackDate: '', result: 'PENDING', fuDueDate: '', validUntil: '', cost: '', notes: '', feedback: '', parentId: '' };

function DueBadge({ due, label }) {
  if (!due) return null;
  if (due.state === 'OVERDUE') return <span className="badge badge-danger">{label} lewat {Math.abs(due.left)} hari</span>;
  if (due.state === 'DUE_SOON') return <span className="badge badge-warning">{label} {due.left} hari lagi</span>;
  return null;
}

export default function McuClient({ sites, data, page, canEdit, preselect }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(preselect && canEdit ? { ...EMPTY, personnelId: preselect } : null);
  const [files, setFiles] = useState([]);
  const [detail, setDetail] = useState(null);
  const cfg = data.cfg;

  const open = (row) => {
    setFiles([]);
    if (!row) return setForm({ ...EMPTY });
    const d = (k) => iso(row[k]) ?? '';
    setForm({
      id: row.id, personnelId: row.personnelId, personName: row.personnel.name, type: row.type, clinic: row.clinic, stage: row.stage,
      screeningDate: d('screeningDate'), mcuDate: d('mcuDate'), resultDate: d('resultDate'), submitDate: d('submitDate'), feedbackDate: d('feedbackDate'),
      result: row.result, fuDueDate: d('fuDueDate'), validUntil: d('validUntil'), cost: row.cost ?? '', notes: row.canMedical ? row.notes ?? '' : undefined, feedback: row.feedback ?? '',
    });
  };

  const followUp = (row) => {
    setFiles([]);
    setDetail(null);
    setForm({ ...EMPTY, personnelId: row.personnelId, personName: row.personnel.name, type: 'FOLLOW_UP', parentId: row.id, clinic: row.clinic, stage: 'FOLLOW_UP', screeningDate: '', mcuDate: todayIso() });
  };

  const save = async (e) => {
    e.preventDefault();
    const { id, personName, ...body } = form;
    void personName;
    if (id) delete body.personnelId;
    if (body.notes === undefined) delete body.notes;
    if (!body.parentId) delete body.parentId;
    const fd = new FormData();
    fd.set('data', JSON.stringify(body));
    files.forEach((f) => fd.append('files', f));
    if (await submit(id ? `/api/mcu/${id}` : '/api/mcu', { method: id ? 'PUT' : 'POST', form: fd })) setForm(null);
  };

  const plan = form ? planMcu(form.screeningDate || form.mcuDate || todayIso(), cfg.durations, form.result === 'FOLLOW_UP') : null;

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
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Input MCU</button>}
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
              {canEdit && <button className="btn btn-primary btn-sm" onClick={() => { setDetail(null); open(detail); }}><Edit size={15} /> Perbarui</button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Perbarui MCU — ${form.personName}` : form?.parentId ? `Follow Up — ${form.personName}` : 'Input MCU'} subtitle="HSE Site dapat memperbarui tanpa approval HO; perubahan dicatat di audit log." size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields columns={3} values={form} setValues={setForm} fields={[
              ...(form.id || form.parentId ? [] : [{ name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true }]),
              { name: 'type', label: 'Jenis MCU', type: 'select', options: MCU_TYPES.map((t) => [t, MCU_TYPE_LABELS[t]]), required: true, noEmpty: true },
              { name: 'clinic', label: 'Klinik', required: true },
              { name: 'stage', label: 'Tahap saat ini', type: 'select', options: MCU_STAGES.map((s) => [s, MCU_STAGE_LABELS[s]]), noEmpty: true },
              { name: 'screeningDate', label: 'Tgl screening', type: 'date' },
              { name: 'mcuDate', label: 'Tgl MCU', type: 'date' },
              { name: 'resultDate', label: 'Tgl hasil keluar', type: 'date' },
              { name: 'submitDate', label: 'Tgl submit', type: 'date' },
              { name: 'feedbackDate', label: 'Tgl feedback', type: 'date' },
              { name: 'result', label: 'Hasil', type: 'select', options: MCU_RESULTS, noEmpty: true },
              { name: 'fuDueDate', label: 'Batas Follow Up', type: 'date', hidden: (v) => v.result !== 'FOLLOW_UP', hint: 'Kosongkan untuk estimasi otomatis.' },
              { name: 'validUntil', label: 'MCU annual berikutnya', type: 'date', hidden: (v) => v.result !== 'FIT', hint: `Kosongkan: otomatis ${cfg.annualMonths} bulan dari tgl MCU.` },
              { name: 'cost', label: 'Biaya (Rp)', type: 'number', min: 0 },
              { name: 'feedback', label: 'Feedback', type: 'textarea', span: true },
              ...(form.notes !== undefined ? [{ name: 'notes', label: 'Catatan medis (terenkripsi)', type: 'textarea', span: true }] : []),
            ]} />
            <div className="form-grid"><FileInput label="Dokumen hasil MCU (privat)" onChange={setFiles} /></div>
            {plan && (
              <div className="notice info">
                Estimasi siap mobilisasi: <strong>{formatDate(plan.readyDate)}</strong> ({plan.totalDays} hari dari {form.screeningDate ? 'screening' : 'MCU'}).
              </div>
            )}
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
