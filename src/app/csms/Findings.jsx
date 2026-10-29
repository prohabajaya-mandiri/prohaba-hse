'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { FINDING_SOURCES, FINDING_STATUSES, PIC_ROLES } from '@/lib/domain/csms';

const reqLabel = (r) => (r ? (r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ?? `${r.item?.refCode ?? ''} (${r.item?.internalCode})`) : null);

/** Register temuan: filter lewat query (fstatus, fsource, fq) agar dapat dibuka dari notifikasi/ringkasan. */
export function FindingsRegister({ findings, sites, canCreate }) {
  const router = useRouter();
  const [form, setForm] = useState(null);
  const filter = (name, value) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
    router.push(url.pathname + url.search);
  };
  const current = (name) => (typeof window === 'undefined' ? '' : new URL(window.location.href).searchParams.get(name) ?? '');
  return (
    <Card title={`Temuan & tindak lanjut (${findings.open} belum ditutup)`} padding={0} actions={<>
      <select className="form-select" aria-label="Status temuan" defaultValue={current('fstatus')} onChange={(e) => filter('fstatus', e.target.value)}>
        <option value="">Semua status</option>
        <option value="OPEN">Belum ditutup</option>
        {FINDING_STATUSES.map((s) => <option key={s} value={s}>{labelOf(s)}</option>)}
      </select>
      <select className="form-select" aria-label="Sumber temuan" defaultValue={current('fsource')} onChange={(e) => filter('fsource', e.target.value)}>
        <option value="">Semua sumber</option>
        {FINDING_SOURCES.map((s) => <option key={s} value={s}>{labelOf(s)}</option>)}
      </select>
      {canCreate && <button className="btn btn-primary btn-sm" onClick={() => setForm({ siteId: sites.filter((s) => !s.isHo)[0]?.id ?? '', source: 'INSPEKSI', requirementId: '', description: '', picRole: 'HSE_SITE', picName: '', dueDate: '', incidentId: '', incidentActionId: '' })}><Plus size={15} /> Temuan</button>}
    </>}>
      <DataTable rows={findings.rows} empty="Belum ada temuan." onRowClick={(f) => router.push(`/csms/findings/${f.id}`)} columns={[
        { key: 'n', label: 'Nomor', render: (f) => (<div><strong>{f.number}</strong><div className="muted">{labelOf(f.source)}</div></div>) },
        { key: 's', label: 'Site', render: (f) => f.site.code },
        { key: 'r', label: 'Butir CSMS', render: (f) => reqLabel(f.requirement) ?? <span className="muted">-</span> },
        { key: 'd', label: 'Uraian', render: (f) => <div className="cell-sub" style={{ maxWidth: 360 }}>{f.description}</div> },
        { key: 'p', label: 'PIC', render: (f) => [f.picRole ? labelOf(f.picRole) : null, f.picName].filter(Boolean).join(' · ') || '-' },
        { key: 'due', label: 'Tenggat', render: (f) => (f.dueDate ? <span className={f.late ? 'text-red' : ''}>{formatDate(f.dueDate)} {f.tz}{f.late && <div><Badge value="OVERDUE" label="Terlambat" /></div>}</span> : <span className="muted">-</span>) },
        { key: 'st', label: 'Status', render: (f) => <Badge value={f.status} /> },
      ]} />
      <NewFinding form={form} setForm={setForm} sites={sites} />
    </Card>
  );
}

function NewFinding({ form, setForm, sites }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [reqs, setReqs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const siteId = form?.siteId;
  useEffect(() => {
    if (!siteId) return;
    // Butir dari penerapan aktif site & insiden site untuk ditautkan (tanpa catatan ganda).
    fetch(`/api/csms/applications?siteId=${siteId}`).then((r) => (r.ok ? r.json() : { rows: [] })).then(async (d) => {
      const all = [];
      for (const a of d.rows ?? []) {
        const detail = await fetch(`/api/csms/applications/${a.id}`).then((r) => (r.ok ? r.json() : null));
        (detail?.requirements ?? []).forEach((r) => all.push([r.id, `${a.template.code} · ${r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ?? r.item?.refCode + ' (lanjutan)'} ${r.item?.internalCode ?? ''} — ${(r.text ?? r.item?.displayText ?? r.item?.sourceText ?? '').slice(0, 80)}`]));
      }
      setReqs(all);
    }).catch(() => setReqs([]));
    fetch(`/api/csms/incident-options?siteId=${siteId}`).then((r) => (r.ok ? r.json() : { rows: [] })).then((d) => setIncidents(d.rows ?? [])).catch(() => setIncidents([]));
  }, [siteId]);
  const save = async (e) => {
    e.preventDefault();
    const res = await submit('/api/csms/findings', { body: form });
    if (res?.id) { setForm(null); router.push(`/csms/findings/${res.id}`); }
  };
  const actions = incidents.find((i) => i.id === form?.incidentId)?.actions ?? [];
  return (
    <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Temuan baru" subtitle="Temuan dari insiden cukup ditautkan ke insiden/tindakannya; tidak perlu dicatat ulang." size="modal-lg">
      {form && (
        <form onSubmit={save} className="stack">
          <FormFields values={form} setValues={setForm} fields={[
            { name: 'siteId', label: 'Site', type: 'select', required: true, noEmpty: true, options: sites.filter((s) => !s.isHo).map((s) => [s.id, `${s.code} — ${s.name}`]) },
            { name: 'source', label: 'Sumber', type: 'select', required: true, noEmpty: true, options: FINDING_SOURCES.map((s) => [s, labelOf(s)]) },
            { name: 'requirementId', label: 'Butir CSMS terkait', type: 'select', span: true, options: reqs },
            { name: 'description', label: 'Uraian temuan', type: 'textarea', required: true, span: true },
            { name: 'picRole', label: 'PIC (bagian)', type: 'select', options: PIC_ROLES.map((r) => [r, labelOf(r)]) },
            { name: 'picName', label: 'Nama PIC' },
            { name: 'dueDate', label: 'Tenggat', type: 'date' },
            { name: 'incidentId', label: 'Insiden terkait', type: 'select', options: incidents.map((i) => [i.id, `${i.number} — ${i.title}`]), hidden: (v) => v.source !== 'INSIDEN' },
            { name: 'incidentActionId', label: 'Tindakan insiden', type: 'select', options: actions.map((a) => [a.id, `${a.description.slice(0, 80)} (${labelOf(a.status)})`]), hidden: (v) => v.source !== 'INSIDEN' || !v.incidentId },
          ]} />
          <button className="btn btn-primary" disabled={busy}>Simpan temuan</button>
        </form>
      )}
    </Modal>
  );
}
