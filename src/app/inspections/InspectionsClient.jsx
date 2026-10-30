'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, CheckCheck } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { formatDate, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { INSPECTION_KINDS, itemsToText, summarizeAnswers } from '@/lib/domain/field-safety';

const RESULT_BTN = [['OK', 'OK', 'btn-primary'], ['TIDAK_OK', 'Tidak OK', 'btn-danger'], ['NA', 'N/A', 'btn-outline']];

function Checklist({ items, answers, setAnswers }) {
  const set = (i, patch) => setAnswers(answers.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>Checklist ({items.length} butir · <span className="text-red">!</span> = kritis)</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnswers(answers.map((a) => (a.result ? a : { ...a, result: 'OK' })))}><CheckCheck size={14} /> Sisanya OK</button>
      </div>
      {items.map((item, i) => {
        const a = answers[i];
        return (
          <div key={i} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 220px', fontWeight: 500 }}>{i + 1}. {item.critical && <span className="text-red" title="Butir kritis">! </span>}{item.text}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {RESULT_BTN.map(([v, label, cls]) => (
                  <button key={v} type="button" className={`btn btn-sm ${a.result === v ? cls : 'btn-ghost'}`} aria-pressed={a.result === v} onClick={() => set(i, { result: v })}>{label}</button>
                ))}
              </div>
            </div>
            {a.result === 'TIDAK_OK' && (
              <input className="form-input" style={{ marginTop: 8 }} required placeholder="Keterangan kerusakan / kondisi (wajib)" value={a.note} onChange={(e) => set(i, { note: e.target.value })} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InspectionsClient({ tab, sites, templates, data, units, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [files, setFiles] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [tpl, setTpl] = useState(null);
  const detail = data?.rows.find((r) => r.id === detailId);
  const template = form && templates.find((t) => t.id === form.templateId);

  const open = () => {
    setFiles([]);
    setAnswers([]);
    setForm({ siteId: sites.filter((x) => !x.isHo).length === 1 ? sites.find((x) => !x.isHo).id : '', templateId: '', inspectedOn: todayIso(), shift: 'PAGI', location: '', unitCode: '', unitType: '', hourMeter: '', inspectorName: '', notes: '', picName: '' });
  };
  const setFormValues = (u) => setForm((prev) => {
    const next = typeof u === 'function' ? u(prev) : u;
    if (next.templateId !== prev.templateId) {
      const t = templates.find((x) => x.id === next.templateId);
      setAnswers((t?.items ?? []).map(() => ({ result: '', note: '' })));
      return { ...next, unitType: t?.unitType ?? '' };
    }
    return next;
  });
  const summary = template && answers.every((a) => a.result) ? summarizeAnswers(template.items.map((it, i) => ({ ...it, ...answers[i] }))) : null;

  const save = async (e) => {
    e.preventDefault();
    if (!answers.every((a) => a.result)) return;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...form, answers }));
    files.forEach((f) => fd.append('files', f));
    const r = await submit('/api/inspections', { form: fd });
    if (r?.id) setForm(null);
  };
  const saveTpl = async (e) => {
    e.preventDefault();
    const { id, ...body } = tpl;
    if (await submit(id ? `/api/inspections/templates/${id}` : '/api/inspections/templates', { method: id ? 'PUT' : 'POST', body })) setTpl(null);
  };

  const isP2h = template?.kind === 'P2H';

  return (
    <div className="stack">
      {tab === 'list' && (
        <>
          <FilterBar filters={[
            { type: 'search', label: 'Cari', placeholder: 'Nomor / unit / lokasi' },
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
            { name: 'kind', label: 'Jenis', type: 'select', options: INSPECTION_KINDS.map((x) => [x, labelOf(x)]) },
            { name: 'result', label: 'Hasil', type: 'select', options: [['LAYAK', 'Layak'], ['TIDAK_LAYAK', 'Tidak layak']] },
            { name: 'from', label: 'Dari', type: 'date' },
            { name: 'to', label: 'Sampai', type: 'date' },
          ]}>
            {canEdit && <button className="btn btn-primary" onClick={open}><Plus size={16} /> Inspeksi / P2H baru</button>}
          </FilterBar>
          <div className="notice info">Setiap butir <strong>Tidak OK</strong> otomatis menjadi tindakan korektif. Butir kritis yang Tidak OK membuat unit/area <strong>TIDAK LAYAK</strong>; untuk P2H, unit tidak boleh dioperasikan sampai diperbaiki.</div>
          <div className="card">
            <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada inspeksi."
              columns={[
                { key: 'n', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.site.code}</div></div>) },
                { key: 'd', label: 'Tanggal', render: (r) => (<div>{formatDate(r.inspectedOn)}<div className="muted">{r.shift ? labelOf(r.shift) : ''}</div></div>) },
                { key: 't', label: 'Checklist', render: (r) => (<div>{r.templateName}<div className="muted">{[r.unitCode, r.location].filter(Boolean).join(' · ')}</div></div>) },
                { key: 'i', label: 'Pemeriksa', render: (r) => r.inspectorName },
                { key: 'x', label: 'Tidak OK', num: true, render: (r) => (r.notOkCount ? <span className="text-red">{r.notOkCount}</span> : 0) },
                { key: 'res', label: 'Hasil', render: (r) => <Badge value={r.result} /> },
              ]} />
          </div>
          <Pager page={page} total={data.total} />
        </>
      )}

      {tab === 'units' && (
        <>
          <div className="toolbar">
            <div className="notice info" style={{ flex: 1 }}>P2H terakhir setiap unit dalam 7 hari. Unit tanpa P2H hari ini perlu diperiksa sebelum beroperasi.</div>
            {canEdit && <button className="btn btn-primary" onClick={open}><Plus size={16} /> P2H baru</button>}
          </div>
          <div className="card">
            <DataTable rows={units} empty="Belum ada P2H dalam 7 hari terakhir."
              columns={[
                { key: 'u', label: 'Unit', render: (r) => (<div><strong>{r.unitCode}</strong><div className="muted">{r.unitType ?? '-'} · {r.site.code}</div></div>) },
                { key: 'd', label: 'P2H terakhir', render: (r) => (<div>{formatDate(r.inspectedOn)} {r.shift ? `· ${labelOf(r.shift)}` : ''}{!r.today && <div className="text-orange" style={{ fontSize: 12 }}>belum P2H hari ini</div>}</div>) },
                { key: 'i', label: 'Pemeriksa', render: (r) => r.inspectorName },
                { key: 'x', label: 'Tidak OK', num: true, render: (r) => r.notOkCount },
                { key: 'res', label: 'Status operasi', render: (r) => <Badge value={r.result} label={r.result === 'LAYAK' ? 'Layak operasi' : 'Tidak layak — stop operasi'} /> },
                { key: 'l', label: '', render: (r) => <Link href={`/inspections?q=${r.number}`}>{r.number}</Link> },
              ]} />
          </div>
        </>
      )}

      {tab === 'templates' && (
        <Card title="Template checklist" padding={0} actions={<button className="btn btn-primary btn-sm" onClick={() => setTpl({ code: '', name: '', kind: 'P2H', unitType: '', itemsText: '', isActive: true })}><Plus size={14} /> Template</button>}>
          <DataTable rows={templates} empty="Belum ada template."
            columns={[
              { key: 'c', label: 'Kode', render: (t) => <strong>{t.code}</strong> },
              { key: 'n', label: 'Nama', render: (t) => (<div>{t.name}<div className="muted">{labelOf(t.kind)}{t.unitType ? ' · ' + t.unitType : ''}</div></div>) },
              { key: 'i', label: 'Butir', num: true, render: (t) => `${t.items.length} (${t.items.filter((i) => i.critical).length} kritis)` },
              { key: 's', label: 'Status', render: (t) => <Badge value={t.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
              { key: 'e', label: '', render: (t) => <button className="btn btn-ghost btn-sm" onClick={() => setTpl({ id: t.id, code: t.code, name: t.name, kind: t.kind, unitType: t.unitType ?? '', itemsText: itemsToText(t.items), isActive: t.isActive })}><Edit size={14} /></button> },
            ]} />
        </Card>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.number} — ${detail.templateName}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.result} /><span className="chip">{detail.okCount} OK · {detail.notOkCount} tidak OK</span></div>
            <dl className="detail-grid">
              <div><dt>Tanggal</dt><dd>{formatDate(detail.inspectedOn)} {detail.shift ? '· ' + labelOf(detail.shift) : ''}</dd></div>
              {detail.unitCode && <div><dt>Unit</dt><dd>{detail.unitCode} {detail.unitType ? `(${detail.unitType})` : ''}{detail.hourMeter != null ? <div className="muted">HM/KM {detail.hourMeter}</div> : null}</dd></div>}
              {detail.location && <div><dt>Lokasi</dt><dd>{detail.location}</dd></div>}
              <div><dt>Pemeriksa</dt><dd>{detail.inspectorName}</dd></div>
              {detail.notes && <div style={{ gridColumn: '1 / -1' }}><dt>Catatan</dt><dd className="pre-line">{detail.notes}</dd></div>}
            </dl>
            <Card title="Hasil checklist" padding={0}>
              <DataTable rows={detail.answers} rowKey={(a) => a.text} columns={[
                { key: 't', label: 'Butir', render: (a) => (<span>{a.critical && <span className="text-red">! </span>}{a.text}</span>) },
                { key: 'r', label: 'Hasil', render: (a) => (a.result === 'NA' ? 'N/A' : <Badge value={a.result} />) },
                { key: 'n', label: 'Keterangan', render: (a) => a.note ?? '' },
              ]} />
            </Card>
            {detail.capas.length > 0 && (
              <Card title="Tindakan korektif" padding={0}>
                <DataTable rows={detail.capas} columns={[
                  { key: 'n', label: 'Nomor', render: (c) => <Link href={`/actions/${c.id}`}>{c.number}</Link> },
                  { key: 't', label: 'Tindakan', render: (c) => c.title },
                  { key: 'p', label: 'PIC', render: (c) => c.picName },
                  { key: 's', label: 'Status', render: (c) => <Badge value={c.status} /> },
                ]} />
              </Card>
            )}
            <div><div className="section-title">Foto</div><FileLinks files={detail.files} /></div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Inspeksi / P2H baru" subtitle="Pilih template, isi setiap butir. Butir Tidak OK wajib diberi keterangan." size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setFormValues} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: sites.filter((x) => x.isActive).map((x) => [x.id, `${x.code} — ${x.name}`]), required: true },
              { name: 'templateId', label: 'Checklist', type: 'select', required: true, options: templates.map((t) => [t.id, `${t.name}${t.unitType ? ' — ' + t.unitType : ''}`]) },
              { name: 'inspectedOn', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
              { name: 'shift', label: 'Shift', type: 'select', options: [['PAGI', 'Pagi'], ['MALAM', 'Malam']] },
              { name: 'unitCode', label: 'Kode / nomor lambung unit', required: true, hidden: () => !isP2h, placeholder: 'mis. DT-104' },
              { name: 'hourMeter', label: 'Hour meter / KM', type: 'number', min: 0, hidden: () => !isP2h },
              { name: 'location', label: 'Lokasi', required: Boolean(template) && !isP2h, placeholder: 'mis. Workshop / Pit 2' },
              { name: 'inspectorName', label: 'Pemeriksa (opsional)', hint: 'Kosong = nama Anda; isi nama operator untuk P2H.' },
            ]} />
            {template && <Checklist items={template.items} answers={answers} setAnswers={setAnswers} />}
            {answers.some((a) => a.result === 'TIDAK_OK') && (
              <FormFields values={form} setValues={setFormValues} fields={[{ name: 'picName', label: 'PIC perbaikan', required: true, hint: 'mis. Mekanik / Plant / Pengawas area. Satu tindakan korektif dibuat per butir Tidak OK.' }]} />
            )}
            <FormFields values={form} setValues={setFormValues} fields={[{ name: 'notes', label: 'Catatan', type: 'textarea', span: true }]} />
            <div className="form-grid"><FileInput label="Foto" accept="image/*" onChange={setFiles} /></div>
            {summary && <div className={`notice ${summary.result === 'LAYAK' ? 'success' : 'danger'}`}>Hasil: <strong>{labelOf(summary.result)}</strong> · {summary.okCount} OK, {summary.notOkCount} tidak OK{summary.result === 'TIDAK_LAYAK' && isP2h ? ' — unit tidak boleh dioperasikan.' : ''}</div>}
            <div className="modal-footer" style={{ padding: 0 }}>
              {template && !answers.every((a) => a.result) && <span className="muted">Isi semua butir checklist.</span>}
              <button className="btn btn-primary" disabled={busy || !template || !answers.every((a) => a.result)}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(tpl)} onClose={() => setTpl(null)} title={tpl?.id ? 'Ubah template checklist' : 'Template checklist baru'} subtitle="Perubahan hanya berlaku untuk inspeksi berikutnya; riwayat lama tetap." size="modal-lg">
        {tpl && (
          <form onSubmit={saveTpl} className="stack">
            <FormFields values={tpl} setValues={setTpl} fields={[
              { name: 'code', label: 'Kode', required: true, placeholder: 'mis. P2H-GR' },
              { name: 'name', label: 'Nama', required: true },
              { name: 'kind', label: 'Jenis', type: 'select', noEmpty: true, options: INSPECTION_KINDS.map((x) => [x, labelOf(x)]) },
              { name: 'unitType', label: 'Jenis unit (P2H)', hidden: (v) => v.kind !== 'P2H' },
              { name: 'itemsText', label: 'Butir checklist', type: 'textarea', rows: 12, required: true, span: true, hint: 'Satu baris satu butir. Awali dengan "!" untuk butir kritis (gagal = tidak layak).' },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
