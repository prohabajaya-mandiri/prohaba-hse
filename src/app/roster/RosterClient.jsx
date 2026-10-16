'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit } from 'lucide-react';
import { Badge, DataTable, FilterBar, FormFields, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { LEAVE_TYPES } from '@/lib/domain/roster';
import { CATEGORIES } from '@/lib/domain/personnel';

const EMPTY_LEAVE = { personnelId: '', type: 'CUTI', startDate: todayIso(), endDate: '', reason: '' };
const EMPTY_POLICY = { name: '', siteId: '', category: 'STAFF', maritalStatus: '', onsiteDays: 90, offDays: 14, countWorkdays: false, notes: '', isActive: true };

export default function RosterClient({ tab, sites, board, leaves, policies, page, canEdit, canPolicy, preselect }) {
  const { submit, busy } = useSubmit();
  const { showPrompt, showConfirm } = useDialog();
  const [leave, setLeave] = useState(preselect && canEdit ? { ...EMPTY_LEAVE, personnelId: preselect } : null);
  const [policy, setPolicy] = useState(null);


  const act = async (l, action) => {
    if (action === 'RETURN') {
      const d = await showPrompt('Tanggal kembali aktual (YYYY-MM-DD)', 'Kembali bekerja', todayIso());
      if (d) await submit(`/api/roster/leaves/${l.id}`, { body: { action, returnDate: d } });
    } else if (action === 'RESCHEDULE') {
      const end = await showPrompt('Tanggal selesai baru (YYYY-MM-DD)', 'Ubah jadwal', iso(l.endDate));
      if (!end) return;
      const reason = await showPrompt('Alasan perubahan', 'Ubah jadwal');
      if (reason) await submit(`/api/roster/leaves/${l.id}`, { body: { action, endDate: end, reason } });
    } else if (await showConfirm(action === 'START' ? 'Mulai cuti/izin ini sekarang?' : 'Batalkan rencana ini?')) {
      await submit(`/api/roster/leaves/${l.id}`, { body: { action } });
    }
  };

  return (
    <div className="stack">
      {tab === 'board' && board && (
        <>
          <div className="kpi-grid">
            <Kpi label="Onsite" value={board.counts.ONSITE ?? 0} tone="green" />
            <Kpi label={`Mendekati cuti (≤ ${board.threshold} hari)`} value={board.counts.MENDEKATI_CUTI ?? 0} tone="yellow" />
            <Kpi label="Lewat jadwal cuti" value={board.counts.LEWAT_JADWAL ?? 0} tone="red" />
            <Kpi label="Sedang cuti / off" value={board.counts.SEDANG_CUTI ?? 0} tone="blue" />
          </div>
          <FilterBar filters={[
            { type: 'search', label: 'Cari personel' },
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
            { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES },
            { name: 'state', label: 'Kondisi', type: 'select', options: ['ONSITE', 'MENDEKATI_CUTI', 'LEWAT_JADWAL', 'SEDANG_CUTI', 'TANPA_POLA'] },
          ]}>
            {canEdit && <button className="btn btn-primary" onClick={() => setLeave({ ...EMPTY_LEAVE })}><Plus size={16} /> Catat cuti/izin/sakit</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={board.rows} rowKey={(r) => r.placementId} empty="Tidak ada personel aktif."
              columns={[
                { key: 'p', label: 'Personel', render: (r) => (<div><Link href={'/personnel/' + r.personnel.id}><strong>{r.personnel.name}</strong></Link><div className="muted">{r.personnel.code} · {r.siteCode} · {labelOf(r.personnel.category)}</div></div>) },
                { key: 'pol', label: 'Pola', render: (r) => (r.policy ? `${r.policy.onsiteDays}${r.policy.countWorkdays ? ' hari kerja' : ' hari'} + ${r.policy.offDays} off` : <span className="muted">Belum diatur</span>) },
                { key: 'cs', label: 'Onsite sejak', render: (r) => formatDate(r.cycleStart) },
                { key: 'due', label: 'Jadwal cuti', render: (r) => (r.planned ? `Rencana ${formatDate(r.planned.startDate)}` : formatDate(r.due)) },
                { key: 'state', label: 'Kondisi', render: (r) => (<div><Badge value={r.state} />{r.left !== null && r.left !== undefined && <div className="muted">{r.left < 0 ? `lewat ${-r.left} hari` : `${r.left} hari lagi`}</div>}</div>) },
                { key: 'ws', label: 'Status kerja', render: (r) => <Badge value={r.personnel.workStatus} /> },
              ]} />
          </div>
          <div className="muted">Acuan: staff menikah 3 bulan onsite + 2 minggu cuti; belum menikah 4 bulan + 2 minggu; manpower mengikuti kebutuhan proyek (umumnya 5–6 bulan); aturan owner dapat berbeda (mis. 70 hari kerja + 2 minggu off). SAKIT tidak mereset siklus onsite.</div>
        </>
      )}

      {tab === 'leaves' && leaves && (
        <>
          <FilterBar filters={[
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
            { name: 'type', label: 'Jenis', type: 'select', options: LEAVE_TYPES },
            { name: 'status', label: 'Status', type: 'select', options: ['RENCANA', 'BERJALAN', 'SELESAI', 'BATAL'] },
          ]}>
            {canEdit && <button className="btn btn-primary" onClick={() => setLeave({ ...EMPTY_LEAVE })}><Plus size={16} /> Catat</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={leaves.rows} empty="Belum ada catatan."
              columns={[
                { key: 'p', label: 'Personel', render: (l) => (<div><Link href={'/personnel/' + l.personnel.id}>{l.personnel.name}</Link><div className="muted">{l.personnel.code} · {l.site.code}</div></div>) },
                { key: 'type', label: 'Jenis', render: (l) => <Badge value={l.type} /> },
                { key: 'period', label: 'Periode', render: (l) => `${formatDate(l.startDate)} – ${formatDate(l.endDate)}` },
                { key: 'ret', label: 'Kembali', render: (l) => formatDate(l.returnDate) },
                { key: 'status', label: 'Status', render: (l) => <Badge value={l.status} /> },
                { key: 'reason', label: 'Keterangan' },
                {
                  key: 'a', label: 'Aksi', render: (l) => canEdit && (
                    <div className="row-actions">
                      {l.status === 'RENCANA' && <button className="btn btn-sm btn-outline" onClick={() => act(l, 'START')}>Mulai</button>}
                      {['RENCANA', 'BERJALAN'].includes(l.status) && <button className="btn btn-sm btn-outline" onClick={() => act(l, 'RETURN')}>Kembali</button>}
                      {['RENCANA', 'BERJALAN'].includes(l.status) && <button className="btn btn-sm btn-ghost" onClick={() => act(l, 'RESCHEDULE')}>Ubah</button>}
                      {l.status === 'RENCANA' && <button className="btn btn-sm btn-ghost" onClick={() => act(l, 'CANCEL')}>Batal</button>}
                    </div>
                  ),
                },
              ]} />
          </div>
          <Pager page={page} total={leaves.total} />
        </>
      )}

      {tab === 'policies' && policies && (
        <>
          <div className="toolbar">
            <div className="notice" style={{ flex: 1 }}>Pola roster khusus per owner/site termasuk parameter yang perlu persetujuan PJM. Pola paling spesifik (site + kategori + status nikah) dipakai lebih dulu.</div>
            {canPolicy && <button className="btn btn-primary" onClick={() => setPolicy({ ...EMPTY_POLICY })}><Plus size={16} /> Pola baru</button>}
          </div>
          <div className="card">
            <DataTable rows={policies}
              columns={[
                { key: 'name', label: 'Nama pola', render: (p) => <strong>{p.name}</strong> },
                { key: 'site', label: 'Site', render: (p) => p.site?.code ?? 'Semua site' },
                { key: 'cat', label: 'Kategori', render: (p) => labelOf(p.category) },
                { key: 'm', label: 'Status nikah', render: (p) => (p.maritalStatus ? labelOf(p.maritalStatus) : 'Semua') },
                { key: 'on', label: 'Onsite', render: (p) => `${p.onsiteDays} ${p.countWorkdays ? 'hari kerja' : 'hari'}` },
                { key: 'off', label: 'Off', render: (p) => `${p.offDays} hari` },
                { key: 'act', label: 'Status', render: (p) => <Badge value={p.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
                ...(canPolicy ? [{ key: 'e', label: '', render: (p) => <button className="btn btn-ghost btn-sm" onClick={() => setPolicy({ ...p, siteId: p.siteId ?? '', maritalStatus: p.maritalStatus ?? '', notes: p.notes ?? '' })}><Edit size={14} /></button> }] : []),
              ]} />
          </div>
        </>
      )}

      <Modal open={Boolean(leave)} onClose={() => setLeave(null)} title="Catat cuti, izin atau sakit" subtitle="Periode yang sedang berjalan langsung memperbarui status kerja.">
        {leave && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await submit('/api/roster/leaves', { body: leave })) setLeave(null); }}>
            <FormFields values={leave} setValues={setLeave} fields={[
              { name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true },
              { name: 'type', label: 'Jenis', type: 'select', options: LEAVE_TYPES, required: true, noEmpty: true },
              { name: 'startDate', label: 'Mulai', type: 'date', required: true },
              { name: 'endDate', label: 'Selesai', type: 'date', required: true },
              { name: 'reason', label: 'Keterangan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(policy)} onClose={() => setPolicy(null)} title={policy?.id ? 'Edit pola roster' : 'Pola roster baru'}>
        {policy && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const { id, site, createdAt, ...body } = policy;
            void site; void createdAt;
            if (await submit(id ? `/api/roster/policies/${id}` : '/api/roster/policies', { method: id ? 'PUT' : 'POST', body })) setPolicy(null);
          }}>
            <FormFields values={policy} setValues={setPolicy} fields={[
              { name: 'name', label: 'Nama pola', required: true, span: true },
              { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]), hint: 'Kosong = acuan umum perusahaan.' },
              { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES, required: true, noEmpty: true },
              { name: 'maritalStatus', label: 'Status nikah', type: 'select', options: ['MENIKAH', 'BELUM_MENIKAH'], hint: 'Kosong = semua.' },
              { name: 'onsiteDays', label: 'Hari onsite', type: 'number', min: 1, required: true },
              { name: 'offDays', label: 'Hari off/cuti', type: 'number', min: 1, required: true },
              { name: 'countWorkdays', label: 'Hitung hari kerja (Minggu libur)', type: 'checkbox' },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
