'use client';

import { useState } from 'react';
import { UserPlus, Edit, KeyRound, Users } from 'lucide-react';
import { Badge, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { ROLE_LABELS, ROLES } from '@/lib/access';
import { formatDate } from '@/lib/dates';

const EMPTY = { name: '', email: '', password: '', role: 'HSE_SITE', region: '', isShared: false, isActive: true, siteIds: [] };

export default function UsersClient({ users, sites }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const [ops, setOps] = useState(null);
  const [opForm, setOpForm] = useState({ name: '', pin: '' });
  const siteName = Object.fromEntries(sites.map((s) => [s.id, s.code]));

  const fields = [
    { name: 'name', label: 'Nama lengkap', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Peran', type: 'select', options: ROLES.map((r) => [r, ROLE_LABELS[r]]), required: true, noEmpty: true },
    { name: 'region', label: 'Wilayah (PM)', type: 'select', options: [['TIMUR', 'Timur'], ['BARAT', 'Barat']], hidden: (v) => v.role !== 'PM' },
    { name: 'password', label: form?.id ? 'Kata sandi baru (opsional)' : 'Kata sandi', type: 'password', required: !form?.id, hint: 'Minimal 10 karakter.' },
    { name: 'isActive', label: 'Akun aktif', type: 'checkbox' },
    { name: 'isShared', label: 'Akun bersama site (wajib operator + PIN)', type: 'checkbox', hidden: (v) => v.role !== 'HSE_SITE', span: true },
  ];

  const save = async (e) => {
    e.preventDefault();
    const body = { ...form };
    const id = body.id;
    delete body.id;
    if (!body.password) delete body.password;
    if (!body.region) body.region = null;
    const ok = await submit(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body });
    if (ok) setForm(null);
  };

  const reset = async (u) => {
    if (!(await showConfirm(`Reset kata sandi ${u.name}? Sesi aktif akan keluar.`))) return;
    const r = await submit(`/api/users/${u.id}/reset`, { refresh: false });
    if (r?.temporaryPassword) await showAlert(`Kata sandi sementara: ${r.temporaryPassword} — sampaikan secara langsung dan minta pengguna menggantinya.`, 'Reset berhasil');
  };

  const saveOperator = async (e) => {
    e.preventDefault();
    const r = await submit(`/api/users/${ops.id}/operators`, { body: opForm });
    if (r) {
      setOps({ ...ops, operators: [...ops.operators.filter((o) => o.id !== r.id), r] });
      setOpForm({ name: '', pin: '' });
    }
  };

  const toggleOperator = async (o) => {
    const r = await submit(`/api/users/${ops.id}/operators`, { body: { id: o.id, name: o.name, isActive: !o.isActive } });
    if (r) setOps({ ...ops, operators: ops.operators.map((x) => (x.id === r.id ? r : x)) });
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="notice info" style={{ flex: 1 }}>
          Satu akun per orang disarankan. Akun bersama HSE Site wajib mendaftarkan operator; setiap login mencatat nama operator dan PIN sehingga audit log memuat pelaku aktual.
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><UserPlus size={17} /> Tambah pengguna</button>
      </div>
      <div className="card">
        <DataTable
          rows={users}
          columns={[
            { key: 'name', label: 'Pengguna', render: (u) => (<div><strong>{u.name}</strong><div className="muted">{u.email}</div></div>) },
            { key: 'role', label: 'Peran', render: (u) => <span className="badge badge-navy">{ROLE_LABELS[u.role]}</span> },
            { key: 'sites', label: 'Cakupan', render: (u) => (['HO_HSE', 'HRD', 'DIREKSI'].includes(u.role) ? 'Semua site' : [u.region && 'Wilayah ' + u.region, ...u.sites.map((s) => siteName[s.siteId])].filter(Boolean).join(', ') || '-') },
            { key: 'isShared', label: 'Jenis', render: (u) => (u.isShared ? `Bersama (${u.operators.filter((o) => o.isActive).length} operator)` : 'Personal') },
            { key: 'isActive', label: 'Status', render: (u) => <Badge value={u.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
            { key: 'lastLoginAt', label: 'Login terakhir', render: (u) => formatDate(u.lastLoginAt) },
            {
              key: 'act', label: 'Aksi', render: (u) => (
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setForm({ ...EMPTY, ...u, password: '', region: u.region ?? '', siteIds: u.sites.map((s) => s.siteId) })}><Edit size={15} /></button>
                  <button className="btn btn-ghost btn-sm" title="Reset kata sandi" onClick={() => reset(u)}><KeyRound size={15} /></button>
                  {u.isShared && <button className="btn btn-ghost btn-sm" title="Operator" onClick={() => setOps(u)}><Users size={15} /></button>}
                </div>
              ),
            },
          ]}
        />
      </div>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit pengguna' : 'Tambah pengguna'} size="modal-lg">
        {form && (
          <form onSubmit={save}>
            <FormFields fields={fields} values={form} setValues={setForm} />
            {!['HO_HSE', 'HRD', 'DIREKSI'].includes(form.role) && (
              <div className="form-group">
                <label className="form-label">Site yang ditugaskan</label>
                <div className="check-list">
                  {sites.map((s) => (
                    <label key={s.id}>
                      <input type="checkbox" checked={form.siteIds.includes(s.id)}
                        onChange={(e) => setForm({ ...form, siteIds: e.target.checked ? [...form.siteIds, s.id] : form.siteIds.filter((x) => x !== s.id) })} />
                      {s.code} — {s.name}
                    </label>
                  ))}
                </div>
                <div className="form-hint">PJO/PM dapat memantau & memeriksa laporan, tetapi tidak otomatis dapat mengedit data induk.</div>
              </div>
            )}
            <div className="modal-footer" style={{ padding: '16px 0 0' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(ops)} onClose={() => setOps(null)} title={`Operator — ${ops?.name ?? ''}`} subtitle="Orang yang memakai akun bersama ini">
        {ops && (
          <div className="stack">
            <DataTable rows={ops.operators} empty="Belum ada operator."
              columns={[
                { key: 'name', label: 'Nama' },
                { key: 'isActive', label: 'Status', render: (o) => <Badge value={o.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
                { key: 'a', label: '', render: (o) => <button className="btn btn-ghost btn-sm" onClick={() => toggleOperator(o)}>{o.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button> },
              ]} />
            <form onSubmit={saveOperator} className="form-grid">
              <div className="form-group"><label className="form-label required">Nama operator</label><input className="form-input" required value={opForm.name} onChange={(e) => setOpForm({ ...opForm, name: e.target.value })} /></div>
              <div className="form-group"><label className="form-label required">PIN (4–12 digit)</label><input className="form-input" required inputMode="numeric" value={opForm.pin} onChange={(e) => setOpForm({ ...opForm, pin: e.target.value })} /></div>
              <button className="btn btn-primary" disabled={busy} style={{ gridColumn: '1 / -1', width: 'fit-content' }}>Tambah operator</button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
