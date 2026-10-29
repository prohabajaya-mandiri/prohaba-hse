'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Edit, Plus, Check, X } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { PIC_ROLES, RESPONSIBILITIES } from '@/lib/domain/csms';
import { CSMS_STATUS, FREQ_OPTIONS, RESP_LABELS, freqLabel, picLabel } from '../../shared';

const configFields = (form) => [
  { name: 'responsibility', label: 'Penanggung jawab', type: 'select', noEmpty: true, options: RESPONSIBILITIES.map((r) => [r, RESP_LABELS[r]]) },
  { name: 'frequency', label: 'Frekuensi', type: 'select', noEmpty: true, options: FREQ_OPTIONS },
  { name: 'dueDate', label: 'Tenggat (sekali/awal proyek)', type: 'date', hidden: () => !['ONCE', 'ON_CHANGE'].includes(form.frequency) },
  { name: 'dueDays', label: 'Tenggat: hari setelah akhir periode', type: 'number', min: 0, max: 365, hint: 'Kosongkan bila belum ditetapkan owner/HO.', hidden: () => ['ONCE', 'EVENT'].includes(form.frequency) },
  { name: 'schedule', label: 'Jadwal khusus (YYYY-MM-DD, pisahkan koma)', type: 'textarea', span: true, hidden: () => form.frequency !== 'CUSTOM' },
  { name: 'picRole', label: 'PIC utama (bagian)', type: 'select', options: PIC_ROLES.map((r) => [r, labelOf(r)]) },
  { name: 'picName', label: 'Nama PIC' },
  { name: 'supportRoles', label: 'Bagian pendukung', hint: 'mis. HRD, Logistik', span: true },
  { name: 'evidenceGuide', label: 'Petunjuk bukti khusus site', type: 'textarea', span: true, hint: 'Kosongkan untuk memakai petunjuk template.' },
  { name: 'ownerReference', label: 'Acuan owner khusus site', span: true },
];

const toForm = (r) => ({
  id: r.id, origin: r.origin, label: r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ?? `${r.item?.refCode} (lanjutan)`,
  responsibility: r.responsibility, frequency: r.frequency, dueDate: iso(r.dueDate) ?? '', dueDays: r.dueDays ?? '', schedule: (r.schedule ?? []).join(', '),
  picRole: r.picRole ?? '', picName: r.picName ?? '', supportRoles: r.supportRoles ?? '', evidenceGuide: r.evidenceGuide ?? '', ownerReference: r.ownerReference ?? '',
  ...(r.origin === 'SITE_ADDITION' ? { code: r.code, text: r.text, sourceRef: r.sourceRef } : {}),
});

export default function ApplicationClient({ app }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [addForm, setAddForm] = useState(null);
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => app.requirements.filter((r) => {
    if (filter === 'NA') return r.applicability !== 'APPLICABLE';
    if (filter === 'NODUE') return r.frequency !== 'EVENT' && r.dueDate == null && r.dueDays == null;
    if (filter === 'ADD') return r.origin === 'SITE_ADDITION';
    return true;
  }), [app.requirements, filter]);
  const pendingNa = app.requirements.filter((r) => r.applicability === 'NA_PENDING').length;

  const saveSettings = async (e) => {
    e.preventDefault();
    if (await submit(`/api/csms/applications/${app.id}`, { method: 'PUT', body: settings })) setSettings(null);
  };
  const saveReq = async (e) => {
    e.preventDefault();
    const { id, origin, label, ...body } = form;
    void origin; void label;
    if (await submit(`/api/csms/requirements/${id}`, { method: 'PUT', body: { action: 'CONFIG', ...body } })) setForm(null);
  };
  const saveAdd = async (e) => {
    e.preventDefault();
    if (await submit(`/api/csms/applications/${app.id}/requirements`, { body: addForm })) setAddForm(null);
  };
  const na = async (r, action) => {
    if (action === 'APPROVE_NA') {
      if (await showConfirm(`Setujui N/A: ${r.naReason}`, 'Setujui N/A')) await submit(`/api/csms/requirements/${r.id}`, { method: 'PUT', body: { action } });
      return;
    }
    if (action === 'SET_APPLICABLE') {
      if (await showConfirm('Kembalikan butir menjadi berlaku?', 'Butir berlaku')) await submit(`/api/csms/requirements/${r.id}`, { method: 'PUT', body: { action } });
      return;
    }
    const reason = await showPrompt(action === 'REJECT_NA' ? 'Alasan penolakan (wajib)' : 'Alasan N/A (wajib)', action === 'REJECT_NA' ? 'Tolak usulan N/A' : 'Tetapkan N/A');
    if (reason?.trim()) await submit(`/api/csms/requirements/${r.id}`, { method: 'PUT', body: { action, reason } });
  };

  return (
    <div className="stack">
      <Card title="Penerapan" actions={<>
        <Link className="btn btn-outline btn-sm" href={`/csms?tab=checklist&applicationId=${app.id}`}>Buka checklist</Link>
        <button className="btn btn-outline btn-sm" onClick={() => setSettings({ projectId: app.projectId ?? '', ownerRegisterNo: app.ownerRegisterNo ?? '', requireReview: app.requireReview, startDate: iso(app.startDate), endDate: iso(app.endDate) ?? '', notes: app.notes ?? '', status: app.status })}><Edit size={15} /> Ubah</button>
      </>}>
        <dl className="detail-grid">
          <div><dt>Site</dt><dd>{app.site.code} — {app.site.name}</dd></div>
          <div><dt>Template</dt><dd>{app.template.code} v{app.template.version}<div className="muted">{app.template.sourceDocCode}</div></dd></div>
          <div><dt>Proyek / owner</dt><dd>{app.site.projects.find((p) => p.id === app.projectId)?.name ?? '-'}<div className="muted">{app.site.projects.find((p) => p.id === app.projectId)?.owner ?? app.template.ownerName}</div></dd></div>
          <div><dt>No. register CMS</dt><dd>{app.ownerRegisterNo ?? 'Belum diterbitkan owner'}</dd></div>
          <div><dt>Periode</dt><dd>{formatDate(app.startDate)} – {app.endDate ? formatDate(app.endDate) : 'berjalan'}</dd></div>
          <div><dt>Alur pemeriksaan</dt><dd>{app.requireReview ? 'Site → PJO/PM → HO' : 'Site → HO'}</dd></div>
          <div><dt>Status</dt><dd><Badge value={app.status} label={app.status === 'ACTIVE' ? 'Aktif' : 'Berakhir'} /></dd></div>
        </dl>
      </Card>

      {pendingNa > 0 && <div className="notice">{pendingNa} usulan N/A dari site menunggu keputusan HO.</div>}

      <Card title={`Persyaratan site (${app.requirements.length})`} padding={0} actions={<>
        <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Saring persyaratan">
          <option value="">Semua butir</option>
          <option value="NA">N/A & usulan N/A</option>
          <option value="NODUE">Tenggat belum ditetapkan</option>
          <option value="ADD">Butir tambahan site</option>
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setAddForm({ elementId: app.template.elements[0]?.id ?? '', code: '', text: '', sourceRef: '', responsibility: 'SITE', frequency: 'ONCE', dueDate: '', dueDays: '', schedule: '', picRole: 'HSE_SITE', picName: '', supportRoles: '', evidenceGuide: '', ownerReference: '' })}><Plus size={15} /> Butir tambahan site</button>
      </>}>
        <DataTable rows={rows} columns={[
          { key: 'c', label: 'Kode', render: (r) => (<div><strong>{r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ?? '—'}</strong><div className="muted">{r.item?.internalCode ?? 'tambahan'}</div></div>) },
          { key: 'el', label: 'Unsur', render: (r) => r.element.number },
          { key: 't', label: 'Persyaratan', render: (r) => (<div style={{ maxWidth: 380 }}>{r.origin === 'SITE_ADDITION' ? r.text : r.item?.displayText ?? r.item?.sourceText}{r.origin === 'SITE_ADDITION' && <div><Badge value="SITE_ADDITION" /> <span className="muted">{r.sourceRef}</span></div>}</div>) },
          { key: 'ap', label: 'Berlaku', render: (r) => (<div><Badge value={r.applicability} label={CSMS_STATUS[r.applicability]} />{r.naReason && r.applicability !== 'APPLICABLE' && <div className="cell-sub">{r.naReason}</div>}</div>) },
          { key: 'rs', label: 'Penanggung jawab', render: (r) => RESP_LABELS[r.responsibility] },
          { key: 'f', label: 'Frekuensi / tenggat', render: (r) => (<div>{freqLabel(r.frequency)}<div className="muted">{r.dueDate ? formatDate(r.dueDate) : r.dueDays != null ? `+${r.dueDays} hari` : r.frequency === 'EVENT' ? 'saat kejadian' : 'tenggat belum ada'}</div></div>) },
          { key: 'p', label: 'PIC', render: (r) => (<div>{picLabel(r)}{r.supportRoles && <div className="muted">{r.supportRoles}</div>}</div>) },
          {
            key: 'a', label: '', render: (r) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" title="Atur" onClick={() => setForm(toForm(r))}><Edit size={14} /></button>
                {r.applicability === 'NA_PENDING' && <>
                  <button className="btn btn-ghost btn-sm" title="Setujui N/A" disabled={busy} onClick={() => na(r, 'APPROVE_NA')}><Check size={14} /></button>
                  <button className="btn btn-ghost btn-sm" title="Tolak N/A" disabled={busy} onClick={() => na(r, 'REJECT_NA')}><X size={14} /></button>
                </>}
                {r.applicability === 'APPLICABLE' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => na(r, 'SET_NA')}>N/A</button>}
                {r.applicability === 'NA' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => na(r, 'SET_APPLICABLE')}>Berlaku</button>}
              </div>
            ),
          },
        ]} />
      </Card>

      <Modal open={Boolean(settings)} onClose={() => setSettings(null)} title="Ubah penerapan">
        {settings && (
          <form onSubmit={saveSettings} className="stack">
            <FormFields values={settings} setValues={setSettings} fields={[
              { name: 'projectId', label: 'Proyek / owner', type: 'select', options: app.site.projects.map((p) => [p.id, `${p.name} — ${p.owner}`]) },
              { name: 'ownerRegisterNo', label: 'No. register CMS (dari owner)' },
              { name: 'startDate', label: 'Mulai berlaku', type: 'date', required: true },
              { name: 'endDate', label: 'Selesai', type: 'date' },
              { name: 'status', label: 'Status', type: 'select', noEmpty: true, options: [['ACTIVE', 'Aktif'], ['ENDED', 'Berakhir']] },
              { name: 'requireReview', label: 'Wajib diperiksa PJO/PM sebelum verifikasi HO', type: 'checkbox', span: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={`Atur butir ${form?.label ?? ''}`} subtitle="Penyesuaian khusus site; teks owner di template tidak berubah." size="modal-lg">
        {form && (
          <form onSubmit={saveReq} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              ...(form.origin === 'SITE_ADDITION' ? [
                { name: 'code', label: 'Kode', required: true },
                { name: 'sourceRef', label: 'Acuan kontrak / surat owner', required: true },
                { name: 'text', label: 'Persyaratan', type: 'textarea', required: true, span: true },
              ] : []),
              ...configFields(form),
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(addForm)} onClose={() => setAddForm(null)} title="Butir tambahan site" subtitle="Dari kontrak/surat owner. Ikut dihitung kelengkapan, tidak menambah nilai maksimum template." size="modal-lg">
        {addForm && (
          <form onSubmit={saveAdd} className="stack">
            <FormFields values={addForm} setValues={setAddForm} fields={[
              { name: 'elementId', label: 'Unsur', type: 'select', noEmpty: true, options: app.template.elements.map((e) => [e.id, `${e.number}. ${e.name}`]) },
              { name: 'code', label: 'Kode', required: true, placeholder: 'S-01' },
              { name: 'sourceRef', label: 'Acuan kontrak / surat owner', required: true, span: true },
              { name: 'text', label: 'Persyaratan', type: 'textarea', required: true, span: true },
              ...configFields(addForm),
            ]} />
            <button className="btn btn-primary" disabled={busy}>Tambah</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
