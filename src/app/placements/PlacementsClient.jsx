'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Check, X, Plus, LogOut } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

const END_REASONS = ['MUTASI', 'DEMOBILISASI', 'RESIGN', 'DIRUMAHKAN', 'SELESAI_PROYEK', 'LAINNYA'];

export default function PlacementsClient({ user, mySites, allSites, data, page, preselect, canDecide }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [mutation, setMutation] = useState(preselect ? { personnelId: preselect.id, toSiteId: '', toPosition: preselect.position, effectiveDate: todayIso(), reason: '' } : null);
  const [placement, setPlacement] = useState(null);
  const [ending, setEnding] = useState(null);
  const canHse = ['HO_HSE', 'HSE_SITE'].includes(user.role);
  const pending = data.mutations.filter((m) => m.status === 'PENDING');

  const decide = async (m, decision) => {
    const note = await showPrompt(decision === 'APPROVE' ? 'Catatan pengesahan (opsional)' : 'Alasan penolakan (wajib)', decision === 'APPROVE' ? `Sahkan ${m.number}` : `Tolak ${m.number}`);
    if (note === null) return;
    await submit(`/api/placements/mutations/${m.id}/decide`, { body: { decision, note } });
  };
  const cancel = async (m) => {
    if (await showConfirm(`Batalkan pengajuan ${m.number}?`)) await submit(`/api/placements/mutations/${m.id}/cancel`);
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari personel' },
        { name: 'siteId', label: 'Site', type: 'select', options: mySites.map((s) => [s.id, s.code]) },
        { name: 'status', label: 'Penempatan', type: 'select', allLabel: 'Aktif', options: [['ENDED', 'Berakhir'], ['all', 'Semua']] },
      ]}>
        {canHse && <button className="btn btn-outline" onClick={() => setPlacement({ personnelId: '', siteId: mySites.length === 1 ? mySites[0].id : '', position: '', startDate: todayIso(), notes: '' })}><Plus size={16} /> Penempatan baru</button>}
        <button className="btn btn-primary" onClick={() => setMutation({ personnelId: '', toSiteId: '', toPosition: '', effectiveDate: todayIso(), reason: '' })}><ArrowLeftRight size={16} /> Ajukan mutasi</button>
      </FilterBar>

      <Card title={`Pengajuan mutasi${pending.length ? ` · ${pending.length} menunggu HO` : ''}`} padding={0}>
        <DataTable rows={data.mutations} empty="Belum ada pengajuan mutasi."
          columns={[
            { key: 'number', label: 'Nomor', render: (m) => (<div><strong>{m.number}</strong><div className="muted">{formatDate(m.createdAt)} · {m.requestedName}</div></div>) },
            { key: 'p', label: 'Personel', render: (m) => <Link href={'/personnel/' + m.personnel.id}>{m.personnel.name}</Link> },
            { key: 'route', label: 'Perpindahan', render: (m) => `${m.personnel.currentSite?.code ?? '-'} → ${m.toSite.code} · ${m.toPosition}` },
            { key: 'eff', label: 'Efektif', render: (m) => formatDate(m.effectiveDate) },
            { key: 'reason', label: 'Alasan', render: (m) => <span className="muted">{m.reason}</span> },
            { key: 'status', label: 'Status', render: (m) => (<div><Badge value={m.status} />{m.decidedName && <div className="muted">{m.decidedName}{m.decisionNote ? ': ' + m.decisionNote : ''}</div>}</div>) },
            {
              key: 'a', label: 'Aksi', render: (m) => m.status === 'PENDING' && (
                <div className="row-actions">
                  {canDecide && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => decide(m, 'APPROVE')}><Check size={14} /> Sahkan</button>}
                  {canDecide && <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => decide(m, 'REJECT')}><X size={14} /> Tolak</button>}
                  {(m.requestedBy === user.id || canDecide) && <button className="btn btn-sm btn-ghost" onClick={() => cancel(m)}>Batal</button>}
                </div>
              ),
            },
          ]} />
      </Card>

      <Card title="Penempatan" padding={0}>
        <DataTable rows={data.rows} empty="Tidak ada penempatan."
          columns={[
            { key: 'p', label: 'Personel', render: (r) => (<div><Link href={'/personnel/' + r.personnel.id}><strong>{r.personnel.name}</strong></Link><div className="muted">{r.personnel.code} · {labelOf(r.personnel.category)}</div></div>) },
            { key: 'site', label: 'Site', render: (r) => r.site.code },
            { key: 'position', label: 'Jabatan' },
            { key: 'start', label: 'Mulai', render: (r) => formatDate(r.startDate) },
            { key: 'end', label: 'Akhir', render: (r) => formatDate(r.endDate) },
            { key: 'status', label: 'Status', render: (r) => (<div><Badge value={r.status} />{r.endReason && <div className="muted">{labelOf(r.endReason)}</div>}</div>) },
            { key: 'a', label: '', render: (r) => r.status === 'ACTIVE' && canHse && <button className="btn btn-ghost btn-sm" title="Akhiri penempatan" onClick={() => setEnding({ id: r.id, name: r.personnel.name, endDate: todayIso(), endReason: 'DEMOBILISASI', workStatus: '', notes: '' })}><LogOut size={15} /></button> },
          ]} />
      </Card>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(mutation)} onClose={() => setMutation(null)} title="Ajukan mutasi" subtitle="Mutasi disahkan HO HSE. Penempatan lama diakhiri dan riwayat tetap tersimpan.">
        {mutation && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await submit('/api/placements/mutations', { body: mutation, success: 'Pengajuan mutasi dikirim ke HO.' })) setMutation(null); }}>
            <FormFields values={mutation} setValues={setMutation} fields={[
              { name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true },
              { name: 'toSiteId', label: 'Site tujuan', type: 'select', options: allSites.map((s) => [s.id, `${s.code} — ${s.name}`]), required: true },
              { name: 'toPosition', label: 'Jabatan di tujuan', required: true },
              { name: 'effectiveDate', label: 'Tanggal efektif', type: 'date', required: true },
              { name: 'reason', label: 'Alasan', type: 'textarea', required: true, span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Kirim pengajuan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(placement)} onClose={() => setPlacement(null)} title="Penempatan baru" subtitle="Untuk personel tanpa penempatan aktif (mis. direkrut kembali).">
        {placement && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await submit('/api/placements', { body: placement })) setPlacement(null); }}>
            <FormFields values={placement} setValues={setPlacement} fields={[
              { name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true, params: { former: 'all' } },
              { name: 'siteId', label: 'Site', type: 'select', options: mySites.filter((s) => s.isActive).map((s) => [s.id, `${s.code} — ${s.name}`]), required: true },
              { name: 'position', label: 'Jabatan', required: true },
              { name: 'startDate', label: 'Tanggal mulai', type: 'date', required: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(ending)} onClose={() => setEnding(null)} title={`Akhiri penempatan — ${ending?.name ?? ''}`}>
        {ending && (
          <form onSubmit={async (e) => { e.preventDefault(); const { id, name, ...body } = ending; void name; if (!body.workStatus) delete body.workStatus; if (await submit(`/api/placements/${id}/end`, { body })) setEnding(null); }}>
            <FormFields values={ending} setValues={setEnding} fields={[
              { name: 'endDate', label: 'Tanggal akhir', type: 'date', required: true },
              { name: 'endReason', label: 'Alasan', type: 'select', options: END_REASONS, required: true, noEmpty: true },
              { name: 'workStatus', label: 'Status kerja berikutnya', type: 'select', options: ['RESIGN', 'DIRUMAHKAN', 'CUTI', 'ACTIVE'], hint: 'Kosongkan untuk mengikuti alasan.' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Akhiri penempatan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
