'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Play, Download, Edit, Wallet, Trash2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Badge, Card, DataTable, FilterBar, FormFields, Kpi, Modal, useSubmit } from '@/components/ui';
import { apiFetch } from '@/lib/client-api';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { idr, labelOf } from '@/lib/labels';
import { DISCUSSED_SCENARIO, RECOMMENDATION_ACTIONS } from '@/lib/domain/hrd';
import { CATEGORIES, WORK_STATUSES } from '@/lib/domain/personnel';

const GROUPS = ['DIRUMAHKAN', 'MUTASI', 'DIBERHENTIKAN'];

export default function HrdClient({ sites, board, scenarios }) {
  const { submit, busy } = useSubmit();
  const { showAlert } = useDialog();
  const [rec, setRec] = useState(null);
  const [salary, setSalary] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [sim, setSim] = useState(null);
  const [search, setSearch] = useState('');
  const rows = board.rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

  const run = async (s) => {
    try {
      const r = await (await apiFetch(`/api/hrd/scenarios/${s.id}/simulate`)).json();
      setSim(r);
    } catch (e) {
      showAlert(e.message, 'Gagal');
    }
  };

  const byMonth = sim ? Object.values(sim.rows.reduce((m, r) => {
    m[r.month] ??= { month: r.month, normal: 0, scenario: 0, saving: 0 };
    m[r.month].normal += r.normal; m[r.month].scenario += r.scenario; m[r.month].saving += r.saving;
    return m;
  }, {})) : [];

  const editSteps = (fn) => setScenario((s) => ({ ...s, steps: fn(s.steps) }));

  return (
    <div className="stack">
      <div className="notice">Status rekomendasi dan persentase skenario hanya alat bantu simulasi, bukan aturan payroll otomatis. Realisasi wajib sesuai kontrak, peraturan dan hukum. Modul KPI karyawan tidak termasuk cakupan.</div>
      <div className="kpi-grid">
        <Kpi label="Hijau — lanjut" value={board.counts.color.HIJAU ?? 0} tone="green" />
        <Kpi label="Kuning — dipertimbangkan" value={board.counts.color.KUNING ?? 0} tone="yellow" />
        <Kpi label="Merah — diberhentikan" value={board.counts.color.MERAH ?? 0} tone="red" />
        <Kpi label="Belum direkomendasi" value={board.counts.color.BELUM ?? 0} tone="navy" />
      </div>

      <Card title="Skenario efisiensi" actions={<>
        <button className="btn btn-outline btn-sm" onClick={() => setScenario({ name: DISCUSSED_SCENARIO.name, notes: DISCUSSED_SCENARIO.notes, steps: DISCUSSED_SCENARIO.steps })}>Dari skenario yang dibahas</button>
        <button className="btn btn-primary btn-sm" onClick={() => setScenario({ name: '', notes: '', steps: [{ month: todayIso().slice(0, 7), rules: { DIRUMAHKAN: { basis: 'POKOK', percent: 100 } } }] })}><Plus size={15} /> Skenario</button>
      </>}>
        {scenarios.length === 0 ? <span className="muted">Belum ada skenario.</span> : (
          <DataTable rows={scenarios} columns={[
            { key: 'name', label: 'Nama', render: (s) => <strong>{s.name}</strong> },
            { key: 'months', label: 'Bulan', render: (s) => s.steps.map((x) => x.month).join(', ') },
            { key: 'notes', label: 'Catatan', render: (s) => <span className="muted">{s.notes ?? '-'}</span> },
            { key: 'a', label: '', render: (s) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setScenario({ id: s.id, name: s.name, notes: s.notes ?? '', steps: s.steps })}><Edit size={14} /></button>
                {board.salaryAllowed && <button className="btn btn-outline btn-sm" onClick={() => run(s)}><Play size={14} /> Simulasi</button>}
                {board.salaryAllowed && <a className="btn btn-ghost btn-sm" href={`/api/hrd/scenarios/${s.id}/export`}><Download size={14} /></a>}
              </div>
            ) },
          ]} />
        )}
      </Card>

      {sim && (
        <Card title={`Hasil simulasi — ${sim.scenario.name}`}>
          <div className="kpi-grid">
            <Kpi label="Biaya normal" value={idr(sim.totals.normal)} tone="navy" />
            <Kpi label="Biaya skenario" value={idr(sim.totals.scenario)} tone="orange" />
            <Kpi label="Penghematan" value={idr(sim.totals.saving)} tone="green" />
            <Kpi label="Personel dihitung" value={sim.included} tone="blue" hint={sim.missingSalary ? `${sim.missingSalary} tanpa data gaji` : null} />
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={byMonth}>
                <CartesianGrid stroke="var(--gray-200)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => (v / 1e6).toFixed(0) + ' jt'} tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v) => idr(v)} />
                <Legend />
                <Bar dataKey="scenario" name="Biaya skenario" fill="#d08a4a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saving" name="Penghematan" fill="#086840" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable rows={sim.rows} rowKey={(r) => r.month + r.siteId} columns={[
            { key: 'month', label: 'Bulan' }, { key: 'siteName', label: 'Site' }, { key: 'headcount', label: 'Personel', num: true },
            { key: 'normal', label: 'Normal', num: true, render: (r) => idr(r.normal) }, { key: 'scenario', label: 'Skenario', num: true, render: (r) => idr(r.scenario) },
            { key: 'saving', label: 'Hemat', num: true, render: (r) => <strong className="text-green">{idr(r.saving)}</strong> },
          ]} />
        </Card>
      )}

      <FilterBar filters={[
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES },
        { name: 'workStatus', label: 'Status kerja', type: 'select', options: WORK_STATUSES },
      ]}>
        <div className="form-group"><label className="form-label">Cari</label><input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama / kode" /></div>
      </FilterBar>
      <div className="card">
        <DataTable rows={rows} empty="Tidak ada personel."
          columns={[
            { key: 'p', label: 'Personel', render: (r) => (<div><Link href={'/personnel/' + r.id}><strong>{r.name}</strong></Link><div className="muted">{r.code} · {r.siteCode} · {labelOf(r.category)}</div></div>) },
            { key: 'pos', label: 'Jabatan', render: (r) => r.position },
            { key: 'ws', label: 'Status kerja', render: (r) => <Badge value={r.workStatus} /> },
            { key: 'rec', label: 'Rekomendasi', render: (r) => (r.recommendation ? (<div><span className={`dot ${r.recommendation.color}`} /> {labelOf(r.recommendation.action)}<div className="muted">{r.recommendation.by} · {formatDate(r.recommendation.at)}</div></div>) : <span className="muted">-</span>) },
            ...(board.salaryAllowed ? [{ key: 'sal', label: 'Gaji pokok + tunjangan', num: true, render: (r) => (r.salary ? (<div>{idr(r.salary.base)} + {idr(r.salary.allowance)}<div className="muted">sejak {formatDate(r.salary.effectiveFrom)}</div></div>) : <span className="muted">-</span>) }] : []),
            { key: 'a', label: '', render: (r) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" title="Rekomendasi" onClick={() => setRec({ id: r.id, name: r.name, color: r.recommendation?.color ?? 'HIJAU', action: r.recommendation?.action ?? 'LANJUT', reason: '' })}><Edit size={14} /></button>
                {board.canEditSalary && <button className="btn btn-ghost btn-sm" title="Data gaji" onClick={() => setSalary({ id: r.id, name: r.name, base: r.salary?.base ?? '', allowance: r.salary?.allowance ?? 0, effectiveFrom: todayIso() })}><Wallet size={14} /></button>}
              </div>
            ) },
          ]} />
      </div>

      <Modal open={Boolean(rec)} onClose={() => setRec(null)} title={`Rekomendasi — ${rec?.name ?? ''}`}>
        {rec && (
          <form onSubmit={async (e) => { e.preventDefault(); const { id, name, ...body } = rec; void name; if (await submit(`/api/hrd/personnel/${id}/recommendation`, { body })) setRec(null); }}>
            <FormFields values={rec} setValues={(u) => setRec((p) => { const n = typeof u === 'function' ? u(p) : u; return n.color !== p.color ? { ...n, action: RECOMMENDATION_ACTIONS[n.color][0] } : n; })} fields={[
              { name: 'color', label: 'Status', type: 'select', options: Object.keys(RECOMMENDATION_ACTIONS), noEmpty: true },
              { name: 'action', label: 'Tindakan', type: 'select', options: RECOMMENDATION_ACTIONS[rec.color], noEmpty: true },
              { name: 'reason', label: 'Alasan', type: 'textarea', span: true, required: rec.color !== 'HIJAU' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(salary)} onClose={() => setSalary(null)} title={`Data gaji — ${salary?.name ?? ''}`} subtitle="Disimpan terenkripsi; riwayat gaji tidak ditimpa.">
        {salary && (
          <form onSubmit={async (e) => { e.preventDefault(); const { id, name, ...body } = salary; void name; if (await submit(`/api/hrd/personnel/${id}/salary`, { body })) setSalary(null); }}>
            <FormFields values={salary} setValues={setSalary} fields={[
              { name: 'base', label: 'Gaji pokok / bulan', type: 'number', min: 0, required: true },
              { name: 'allowance', label: 'Tunjangan tetap / bulan', type: 'number', min: 0 },
              { name: 'effectiveFrom', label: 'Berlaku mulai', type: 'date', required: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(scenario)} onClose={() => setScenario(null)} title={scenario?.id ? 'Edit skenario' : 'Skenario baru'} subtitle="Personel tanpa rekomendasi / LANJUT selalu 100% gaji total, kecuali diatur." size="modal-xl">
        {scenario && (
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); const { id, ...body } = scenario; if (await submit(id ? `/api/hrd/scenarios/${id}` : '/api/hrd/scenarios', { method: id ? 'PUT' : 'POST', body })) setScenario(null); }}>
            <FormFields values={scenario} setValues={setScenario} fields={[{ name: 'name', label: 'Nama', required: true, span: true }, { name: 'notes', label: 'Catatan', type: 'textarea', span: true }]} />
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Bulan</th>{GROUPS.map((g) => <th key={g}>{labelOf(g)}</th>)}<th /></tr></thead>
                <tbody>
                  {scenario.steps.map((s, i) => (
                    <tr key={i}>
                      <td><input className="form-input" type="month" value={s.month} onChange={(e) => editSteps((st) => st.map((x, j) => (j === i ? { ...x, month: e.target.value } : x)))} /></td>
                      {GROUPS.map((g) => {
                        const r = s.rules?.[g] ?? { basis: 'TOTAL', percent: 100 };
                        const set = (patch) => editSteps((st) => st.map((x, j) => (j === i ? { ...x, rules: { ...x.rules, [g]: { ...r, ...patch } } } : x)));
                        return (
                          <td key={g}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <select className="form-select" value={r.basis} onChange={(e) => set({ basis: e.target.value })}><option value="TOTAL">Total</option><option value="POKOK">Pokok</option></select>
                              <input className="form-input" style={{ width: 72 }} type="number" min={0} max={100} value={r.percent} onChange={(e) => set({ percent: Number(e.target.value) })} />
                            </div>
                          </td>
                        );
                      })}
                      <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => editSteps((st) => st.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-outline btn-sm" style={{ width: 'fit-content' }} onClick={() => editSteps((st) => [...st, { month: '', rules: {} }])}><Plus size={14} /> Tambah bulan</button>
            <button className="btn btn-primary" disabled={busy}>Simpan skenario</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
