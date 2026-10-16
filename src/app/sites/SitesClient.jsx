'use client';

import { useState } from 'react';
import { Plus, Edit, Briefcase, UserCheck } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const ROLE_NAMES = { PJO: 'PJO', PM: 'PM', HSE_SITE: 'HSE Site' };

export default function SitesClient({ sites, canEdit }) {
  const { submit, busy } = useSubmit();
  const [siteForm, setSiteForm] = useState(null);
  const [projectForm, setProjectForm] = useState(null);
  const [respForm, setRespForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const detail = sites.find((s) => s.id === detailId);

  const current = (s, role) => s.responsibles.find((r) => r.role === role && !r.endDate)?.name ?? '-';

  const saveSite = async (e) => {
    e.preventDefault();
    const { id, ...body } = siteForm;
    if (await submit(id ? `/api/sites/${id}` : '/api/sites', { method: id ? 'PUT' : 'POST', body })) setSiteForm(null);
  };
  const saveProject = async (e) => {
    e.preventDefault();
    const { siteId, ...body } = projectForm;
    if (await submit(`/api/sites/${siteId}/projects`, { body })) setProjectForm(null);
  };
  const saveResp = async (e) => {
    e.preventDefault();
    const { siteId, ...body } = respForm;
    if (await submit(`/api/sites/${siteId}/responsibles`, { body })) setRespForm(null);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="notice info" style={{ flex: 1 }}>Referensi awal site perlu diverifikasi ulang status aktifnya saat implementasi.</div>
        {canEdit && <button className="btn btn-primary" onClick={() => setSiteForm({ code: '', name: '', location: '', region: 'TIMUR', isHo: false, isActive: true })}><Plus size={17} /> Tambah site</button>}
      </div>
      <div className="card">
        <DataTable
          rows={sites}
          onRowClick={(s) => setDetailId(s.id)}
          columns={[
            { key: 'code', label: 'Kode', render: (s) => <strong>{s.code}</strong> },
            { key: 'name', label: 'Site', render: (s) => (<div>{s.name}<div className="muted">{s.location ?? ''}</div></div>) },
            { key: 'region', label: 'Wilayah', render: (s) => labelOf(s.region) },
            { key: 'project', label: 'Proyek aktif', render: (s) => s.projects.filter((p) => p.status === 'ACTIVE').map((p) => `${p.name} (${p.owner})`).join('; ') || '-' },
            { key: 'pjo', label: 'PJO', render: (s) => current(s, 'PJO') },
            { key: 'pm', label: 'PM', render: (s) => current(s, 'PM') },
            { key: 'hse', label: 'HSE Site', render: (s) => current(s, 'HSE_SITE') },
            { key: 'mp', label: 'Personel aktif', num: true, render: (s) => s._count.placements },
            { key: 'isActive', label: 'Status', render: (s) => <Badge value={s.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
          ]}
        />
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.code} — ${detail.name}` : ''} size="modal-xl">
        {detail && (
          <div className="stack">
            {canEdit && (
              <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setSiteForm({ ...detail })}><Edit size={15} /> Edit site</button>
                <button className="btn btn-outline btn-sm" onClick={() => setProjectForm({ siteId: detail.id, name: '', owner: '', contractNo: '', startDate: '', endDate: '', status: 'ACTIVE', notes: '' })}><Briefcase size={15} /> Tambah proyek</button>
                <button className="btn btn-outline btn-sm" onClick={() => setRespForm({ siteId: detail.id, role: 'PJO', name: '', phone: '', startDate: todayIso() })}><UserCheck size={15} /> Ganti penanggung jawab</button>
              </div>
            )}
            <Card title="Riwayat proyek" padding={0}>
              <DataTable rows={detail.projects} empty="Belum ada proyek."
                columns={[
                  { key: 'name', label: 'Proyek' },
                  { key: 'owner', label: 'Owner' },
                  { key: 'contractNo', label: 'Kontrak' },
                  { key: 'period', label: 'Periode', render: (p) => `${formatDate(p.startDate)} – ${formatDate(p.endDate)}` },
                  { key: 'status', label: 'Status', render: (p) => <Badge value={p.status === 'ACTIVE' ? 'AKTIF' : p.status} /> },
                  ...(canEdit ? [{ key: 'e', label: '', render: (p) => <button className="btn btn-ghost btn-sm" onClick={() => setProjectForm({ siteId: detail.id, id: p.id, name: p.name, owner: p.owner, contractNo: p.contractNo ?? '', startDate: iso(p.startDate) ?? '', endDate: iso(p.endDate) ?? '', status: p.status, notes: p.notes ?? '' })}><Edit size={14} /></button> }] : []),
                ]} />
            </Card>
            <Card title="Riwayat penanggung jawab" padding={0}>
              <DataTable rows={detail.responsibles} empty="Belum ada penanggung jawab."
                columns={[
                  { key: 'role', label: 'Peran', render: (r) => ROLE_NAMES[r.role] },
                  { key: 'name', label: 'Nama' },
                  { key: 'phone', label: 'Telepon' },
                  { key: 'start', label: 'Mulai', render: (r) => formatDate(r.startDate) },
                  { key: 'end', label: 'Selesai', render: (r) => (r.endDate ? formatDate(r.endDate) : <Badge value="AKTIF" />) },
                ]} />
            </Card>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(siteForm)} onClose={() => setSiteForm(null)} title={siteForm?.id ? 'Edit site' : 'Tambah site'}>
        {siteForm && (
          <form onSubmit={saveSite}>
            <FormFields values={siteForm} setValues={setSiteForm} fields={[
              { name: 'code', label: 'Kode site', required: true },
              { name: 'name', label: 'Nama site', required: true },
              { name: 'location', label: 'Lokasi', span: true },
              { name: 'region', label: 'Wilayah', type: 'select', options: [['TIMUR', 'Timur'], ['BARAT', 'Barat'], ['HO', 'Head Office']], required: true, noEmpty: true },
              { name: 'isHo', label: 'Head Office', type: 'checkbox' },
              { name: 'isActive', label: 'Site aktif', type: 'checkbox' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(projectForm)} onClose={() => setProjectForm(null)} title={projectForm?.id ? 'Edit proyek' : 'Tambah proyek'}>
        {projectForm && (
          <form onSubmit={saveProject}>
            <FormFields values={projectForm} setValues={setProjectForm} fields={[
              { name: 'name', label: 'Nama proyek', required: true, span: true },
              { name: 'owner', label: 'Owner', required: true },
              { name: 'contractNo', label: 'No kontrak' },
              { name: 'startDate', label: 'Tanggal mulai', type: 'date' },
              { name: 'endDate', label: 'Tanggal selesai', type: 'date' },
              { name: 'status', label: 'Status', type: 'select', options: [['ACTIVE', 'Aktif'], ['SELESAI', 'Selesai'], ['NONAKTIF', 'Nonaktif']], noEmpty: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(respForm)} onClose={() => setRespForm(null)} title="Ganti penanggung jawab" subtitle="Penanggung jawab lama otomatis ditutup; riwayat tetap tersimpan.">
        {respForm && (
          <form onSubmit={saveResp}>
            <FormFields values={respForm} setValues={setRespForm} fields={[
              { name: 'role', label: 'Peran', type: 'select', options: Object.entries(ROLE_NAMES), required: true, noEmpty: true },
              { name: 'name', label: 'Nama', required: true },
              { name: 'phone', label: 'Telepon' },
              { name: 'startDate', label: 'Mulai bertugas', type: 'date', required: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
