'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const dash = (v) => v ?? <span className="text-red">—</span>;
const fmt = (d) => (d ? formatDate(d) : null);

/** Data administrasi owner per site (format AMM-VIB1-F-SHE-008B). */
export function AdministrationCard({ admin, user }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const isHo = user.role === 'HO_HSE';
  const save = async (e) => {
    e.preventDefault();
    const { siteId, siteCode, ...body } = form;
    void siteCode;
    if (!isHo) { delete body.userDepartment; delete body.riskLevel; }
    if (await submit(`/api/csms/profile/sites/${siteId}`, { method: 'PUT', body })) setForm(null);
  };
  return (
    <Card title="Data administrasi perusahaan & site (AMM-VIB1-F-SHE-008B)" padding={0} actions={isHo && <Link className="btn btn-outline btn-sm" href="/csms?tab=setup#profil">Profil perusahaan</Link>}>
      <div className="muted" style={{ padding: '12px 20px 0' }}>
        Sumber: profil perusahaan (HO), Site &amp; Proyek (PJO, Safety Officer), profil site, dan penempatan aktif. Manpower = {admin.definition} Tanda <span className="text-red">—</span> = belum diisi.
      </div>
      <DataTable rows={admin.rows} rowKey={(r) => r.siteId} empty="Tidak ada site aktif dalam cakupan Anda." columns={[
        { key: 's', label: 'Site', render: (r) => (<div><strong>{r.siteCode}</strong><div className="muted">{r.owners ?? '-'}</div></div>) },
        { key: 'reg', label: 'No. register CMS', render: (r) => r.registerNo ?? <span className="muted">Dari owner</span> },
        { key: 'dep', label: 'Departemen user', render: (r) => dash(r.userDepartment) },
        { key: 'pjo', label: 'PJO / kompetensi / pengesahan', render: (r) => (<div>{dash(r.pjoName)}<div className="muted">{r.pjoCompetency ?? '—'} · {r.pjoApprovalNo ?? '—'}{r.pjoApprovalDate ? ` (${fmt(r.pjoApprovalDate)})` : ''}</div><div className="muted">{[r.pjoPhone, r.pjoEmail].filter(Boolean).join(' · ')}</div></div>) },
        { key: 'so', label: 'Safety Officer', render: (r) => (<div>{dash(r.safetyOfficer)}<div className="muted">{[r.safetyOfficerPhone, r.safetyOfficerEmail].filter(Boolean).join(' · ')}</div></div>) },
        { key: 'iujp', label: 'Kategori / IUJP', render: (r) => (<div>{r.businessCategory ? labelOf(r.businessCategory) : dash(null)} · {r.businessScale ? labelOf(r.businessScale) : '—'}<div className="muted">{r.iujpNumber ?? '—'}{r.iujpExpiry ? ` s/d ${fmt(r.iujpExpiry)}` : ''}</div></div>) },
        { key: 'addr', label: 'Alamat site / wilayah', render: (r) => (<div>{dash(r.siteAddress)}<div className="muted">{[r.regency, r.province].filter(Boolean).join(', ') || '—'}</div></div>) },
        { key: 'risk', label: 'Risiko / lingkup', render: (r) => (<div>{r.riskLevel ? <Badge value={r.riskLevel} /> : dash(null)}<div className="cell-sub">{r.workScope ?? '—'}</div></div>) },
        { key: 'mp', label: 'Manpower', num: true, render: (r) => (<div><strong>{r.manpower}</strong><div className="muted" style={{ fontSize: 12 }}>{Object.entries(r.manpowerByCategory).map(([k, v]) => `${labelOf(k)} ${v}`).join(' · ')}</div></div>) },
        { key: 'm', label: 'Kelengkapan', render: (r) => (r.missing.length ? <Badge value="REVISION" label={`${r.missing.length} kolom kosong`} /> : <Badge value="VERIFIED" label="Lengkap" />) },
        {
          key: 'a', label: '', render: (r) => (['HO_HSE', 'HSE_SITE'].includes(user.role) ? (
            <button className="btn btn-ghost btn-sm" title="Ubah profil site" onClick={() => setForm({ siteId: r.siteId, siteCode: r.siteCode, userDepartment: r.profile?.userDepartment ?? '', siteAddress: r.profile?.siteAddress ?? '', province: r.profile?.province ?? '', regency: r.profile?.regency ?? '', riskLevel: r.profile?.riskLevel ?? '', workScope: r.profile?.workScope ?? '' })}><Edit size={14} /></button>
          ) : null),
        },
      ]} />
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={`Profil site ${form?.siteCode ?? ''}`} subtitle="PJO & Safety Officer diatur di Site & Proyek; legalitas (IUJP) di profil perusahaan HO.">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              ...(isHo ? [
                { name: 'userDepartment', label: 'Departemen user (owner)' },
                { name: 'riskLevel', label: 'Tingkat risiko pekerjaan', type: 'select', options: [['RENDAH', 'Rendah'], ['SEDANG', 'Sedang'], ['TINGGI', 'Tinggi']], hint: 'Disimpan terpisah dari hasil assessment.' },
              ] : []),
              { name: 'siteAddress', label: 'Alamat site', type: 'textarea', span: true },
              { name: 'province', label: 'Provinsi' },
              { name: 'regency', label: 'Kabupaten' },
              { name: 'workScope', label: 'Lingkup pekerjaan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </Card>
  );
}

/** Profil & legalitas perusahaan (HO). */
export function CompanyProfileCard({ company }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState({
    name: company?.name ?? 'PT. Prohaba Jaya Mandiri', hoAddress: company?.hoAddress ?? '', businessCategory: company?.businessCategory ?? '',
    businessScale: company?.businessScale ?? '', iujpNumber: company?.iujpNumber ?? '', iujpExpiry: iso(company?.iujpExpiry) ?? '', notes: company?.notes ?? '',
  });
  const save = (e) => { e.preventDefault(); submit('/api/csms/profile', { method: 'PUT', body: form, success: 'Profil perusahaan disimpan.' }); };
  return (
    <div id="profil">
      <Card title="Profil & legalitas perusahaan (008B)" actions={company?.updatedByName && <span className="muted">Terakhir diubah {company.updatedByName}</span>}>
        <form onSubmit={save} className="stack">
          <FormFields values={form} setValues={setForm} fields={[
            { name: 'name', label: 'Nama perusahaan', required: true },
            { name: 'businessCategory', label: 'Kategori usaha jasa pertambangan', type: 'select', options: [['INTI', 'Inti'], ['NON_INTI', 'Non inti']] },
            { name: 'businessScale', label: 'Kategori usaha', type: 'select', options: [['LOKAL', 'Lokal'], ['NASIONAL', 'Nasional']] },
            { name: 'iujpNumber', label: 'Nomor IUJP / izin teknis' },
            { name: 'iujpExpiry', label: 'Masa berlaku IUJP', type: 'date' },
            { name: 'hoAddress', label: 'Alamat kantor pusat', type: 'textarea', span: true },
            { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
          ]} />
          <button className="btn btn-primary" style={{ width: 'fit-content' }} disabled={busy}>Simpan profil</button>
        </form>
      </Card>
    </div>
  );
}
