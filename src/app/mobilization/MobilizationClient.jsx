'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, X, Plane, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, PersonnelPicker, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { idr, labelOf } from '@/lib/labels';

const STATUSES = ['DIRENCANAKAN', 'MENUNGGU_PERSYARATAN', 'SIAP', 'PERJALANAN', 'TIBA', 'SELESAI', 'BATAL'];
const NEXT = {
  DIRENCANAKAN: ['SIAP', 'MENUNGGU_PERSYARATAN', 'BATAL'],
  MENUNGGU_PERSYARATAN: ['SIAP', 'BATAL'],
  SIAP: ['PERJALANAN', 'BATAL'],
  PERJALANAN: ['TIBA'],
  TIBA: ['SELESAI'],
};

export default function MobilizationClient({ user, sites, data, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [form, setForm] = useState(null);
  const [people, setPeople] = useState([]);

  const openForm = (type) => {
    setPeople([]);
    setForm({ type, siteId: sites.length === 1 ? sites[0].id : '', origin: type === 'MOBILISASI' ? 'Head Office' : '', destination: '', departDate: todayIso(), arriveDate: '', transport: '', cost: '', notes: '', demobReason: '', nextStatus: 'CUTI' });
  };

  const create = async (e) => {
    e.preventDefault();
    const body = { ...form, personnelIds: people.map((p) => p.id) };
    if (body.type === 'MOBILISASI') { delete body.demobReason; delete body.nextStatus; }
    if (await submit('/api/mobilization', { body })) setForm(null);
  };

  const move = async (m, status) => {
    if (!(await showConfirm(`Ubah status ${m.code} menjadi "${labelOf(status)}"?${status === 'SELESAI' && m.type === 'DEMOBILISASI' ? ' Penempatan aktif anggota akan diakhiri.' : ''}`))) return;
    const r = await submit(`/api/mobilization/${m.id}/status`, { body: { status }, confirm422: true });
    if (r?.needsConfirm && user.role === 'HO_HSE') {
      const note = await showPrompt(r.message + ' Alasan melanjutkan (tercatat di audit log):', 'Lewati persyaratan');
      if (note) await submit(`/api/mobilization/${m.id}/status`, { body: { status, override: true, note } });
    } else if (r?.needsConfirm) {
      await showConfirm(r.message, 'Persyaratan belum lengkap');
    }
  };

  const base = (m) => ({ origin: m.origin, destination: m.destination, departDate: iso(m.departDate), arriveDate: iso(m.arriveDate) ?? '', transport: m.transport ?? '', cost: m.cost ?? '', notes: m.notes ?? '' });
  const removeMember = async (m, member) => {
    if (await showConfirm(`Keluarkan ${member.personnel.name} dari ${m.code}?`)) {
      await submit(`/api/mobilization/${m.id}`, { method: 'PUT', body: { ...base(m), removeMemberIds: [member.id] } });
    }
  };
  const addMember = (m, personnelId) => submit(`/api/mobilization/${m.id}`, { method: 'PUT', body: { ...base(m), addPersonnelIds: [personnelId] } });

  return (
    <div className="stack">
      <FilterBar filters={[
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'type', label: 'Jenis', type: 'select', options: ['MOBILISASI', 'DEMOBILISASI'] },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES },
      ]}>
        {canEdit && <button className="btn btn-outline" onClick={() => openForm('DEMOBILISASI')}><Plus size={16} /> Demobilisasi</button>}
        {canEdit && <button className="btn btn-primary" onClick={() => openForm('MOBILISASI')}><Plane size={16} /> Kloter mobilisasi</button>}
      </FilterBar>

      {data.rows.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Belum ada kloter.</div>}
      {data.rows.map((m) => {
        const notReady = Object.values(m.check).filter((c) => !c.ready).length;
        return (
          <Card key={m.id}
            title={<span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{m.code} <Badge value={m.type} label={labelOf(m.type === 'MOBILISASI' ? 'MOBILISASI' : 'DEMOBILISASI')} /> <Badge value={m.status} /></span>}
            actions={canEdit && (NEXT[m.status] ?? []).map((s) => (
              <button key={s} className={`btn btn-sm ${s === 'BATAL' ? 'btn-ghost' : 'btn-outline'}`} disabled={busy} onClick={() => move(m, s)}>{labelOf(s)}</button>
            ))}>
            <dl className="detail-grid" style={{ marginBottom: 14 }}>
              <div><dt>Site</dt><dd>{m.site.code}</dd></div>
              <div><dt>Rute</dt><dd>{m.origin} → {m.destination}</dd></div>
              <div><dt>Berangkat</dt><dd>{formatDate(m.departDate)}</dd></div>
              <div><dt>Tiba</dt><dd>{formatDate(m.arriveDate)}</dd></div>
              <div><dt>Transportasi</dt><dd>{m.transport ?? '-'}</dd></div>
              <div><dt>Biaya</dt><dd>{m.cost ? idr(m.cost) : '-'}</dd></div>
            </dl>
            {notReady > 0 && <div className="notice" style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {notReady} personel belum memenuhi persyaratan MCU/permit.</div>}
            <DataTable rows={m.members} columns={[
              { key: 'p', label: 'Personel', render: (x) => (<div><Link href={'/personnel/' + x.personnel.id}>{x.personnel.name}</Link><div className="muted">{x.personnel.code} · {x.personnel.position}</div></div>) },
              ...(m.type === 'MOBILISASI' && m.check && Object.keys(m.check).length ? [{
                key: 'chk', label: 'Persyaratan', render: (x) => {
                  const c = m.check[x.personnelId];
                  if (!c) return '-';
                  return c.ready ? <span className="text-green"><CheckCircle2 size={14} /> MCU {labelOf(c.fitness)} · permit {labelOf(c.permit)}</span> : <span className="text-red">{c.issues.join('; ')}</span>;
                },
              }] : []),
              ...(m.type === 'DEMOBILISASI' ? [{ key: 'reason', label: 'Alasan / status berikutnya', render: (x) => `${x.demobReason ?? '-'} → ${labelOf(x.nextStatus)}` }] : []),
              { key: 'arr', label: 'Tiba', render: (x) => (x.arrived ? formatDate(x.arrivedAt) : m.status === 'PERJALANAN' && canEdit ? <button className="btn btn-sm btn-outline" onClick={() => submit(`/api/mobilization/members/${x.id}/arrive`, { body: {} })}>Konfirmasi tiba</button> : '-') },
              ...(canEdit && ['DIRENCANAKAN', 'MENUNGGU_PERSYARATAN', 'SIAP'].includes(m.status) ? [{ key: 'rm', label: '', render: (x) => <button className="btn btn-ghost btn-sm" onClick={() => removeMember(m, x)}><X size={14} /></button> }] : []),
            ]} />
            {canEdit && ['DIRENCANAKAN', 'MENUNGGU_PERSYARATAN', 'SIAP'].includes(m.status) && (
              <div style={{ marginTop: 12, maxWidth: 420 }}>
                <PersonnelPicker value="" onChange={(pid) => pid && addMember(m, pid)} params={m.type === 'DEMOBILISASI' ? { siteId: m.siteId } : {}} />
                <div className="form-hint">Tambah anggota kloter</div>
              </div>
            )}
          </Card>
        );
      })}
      <Pager page={page} total={data.total} limit={30} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.type === 'MOBILISASI' ? 'Kloter mobilisasi baru' : 'Demobilisasi'} subtitle="Status kloter: direncanakan → menunggu persyaratan → siap → perjalanan → tiba → selesai." size="modal-lg">
        {form && (
          <form onSubmit={create} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'siteId', label: form.type === 'MOBILISASI' ? 'Site tujuan' : 'Site asal', type: 'select', options: sites.filter((s) => s.isActive).map((s) => [s.id, `${s.code} — ${s.name}`]), required: true },
              { name: 'departDate', label: 'Tanggal berangkat', type: 'date', required: true },
              { name: 'origin', label: 'Asal', required: true },
              { name: 'destination', label: 'Tujuan', required: true },
              { name: 'arriveDate', label: 'Estimasi tiba', type: 'date' },
              { name: 'transport', label: 'Transportasi', placeholder: 'Pesawat / travel / kapal' },
              { name: 'cost', label: 'Biaya total (Rp)', type: 'number', min: 0 },
              ...(form.type === 'DEMOBILISASI' ? [
                { name: 'demobReason', label: 'Alasan demobilisasi', required: true },
                { name: 'nextStatus', label: 'Status penempatan berikutnya', type: 'select', options: ['CUTI', 'DIRUMAHKAN', 'RESIGN', 'MUTASI'], noEmpty: true },
              ] : []),
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div>
              <label className="form-label required">Personel ({people.length})</label>
              <PersonnelPicker value="" onChange={(pid, p) => p && !people.some((x) => x.id === pid) && setPeople([...people, p])} params={form.type === 'DEMOBILISASI' && form.siteId ? { siteId: form.siteId } : {}} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {people.map((p) => <span key={p.id} className="chip">{p.name} <button type="button" onClick={() => setPeople(people.filter((x) => x.id !== p.id))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={12} /></button></span>)}
              </div>
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button className="btn btn-primary" disabled={busy || !people.length}>Simpan kloter</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
