'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, Printer, Edit, Trash2, Clock, Users, ShieldCheck, Activity } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { addDays, formatDate, iso, todayIso } from '@/lib/dates';
import { fmtNum, labelOf } from '@/lib/labels';
import { calcManhours } from '@/lib/domain/performance';

const TABS = [['recap', 'Rekap & tren'], ['input', 'Input harian'], ['activities', 'Aktivitas HSE'], ['indicators', 'Indikator & target']];

export default function PerformanceClient({ tab, sites, data, activities, daily, indicators, page, canEdit, canIndicator }) {
  const router = useRouter();
  const params = useSearchParams();
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [dailyForm, setDailyForm] = useState(null);
  const [actForm, setActForm] = useState(null);
  const [files, setFiles] = useState([]);
  const [indForm, setIndForm] = useState(null);
  const siteOpts = sites.filter((s) => s.isActive).map((s) => [s.id, `${s.code} — ${s.name}`]);
  const defaultSite = sites.length === 1 ? sites[0].id : params.get('siteId') ?? '';
  const nonIncident = indicators.filter((i) => i.group !== 'INCIDENT' && i.isActive);
  const periodFilters = [
    { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]), allLabel: 'Semua site' },
    { name: 'from', label: 'Dari', type: 'date', default: iso(addDays(new Date(todayIso()), -29)) },
    { name: 'to', label: 'Sampai', type: 'date', default: todayIso() },
  ];

  const go = (t) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    next.delete('page');
    router.push('/performance?' + next);
  };

  const saveActivity = async (e) => {
    e.preventDefault();
    const { id, files: existingFiles, ...body } = actForm;
    void existingFiles;
    if (id) delete body.siteId;
    const fd = new FormData();
    fd.set('data', JSON.stringify(body));
    files.forEach((f) => fd.append('files', f));
    if (await submit(id ? `/api/performance/activities/${id}` : '/api/performance/activities', { method: id ? 'PUT' : 'POST', form: fd })) setActForm(null);
  };

  return (
    <div className="stack">
      <div className="tabs-bar no-print">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => go(k)}>{l}</button>)}
      </div>

      {tab === 'recap' && data && (
        <>
          <FilterBar filters={[...periodFilters, { name: 'granularity', label: 'Rekap', type: 'select', noAll: true, default: 'daily', options: [['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan']] }]}>
            <a className="btn btn-outline" href={'/api/performance/export?' + params.toString()}><Download size={16} /> Excel</a>
            <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> PDF</button>
          </FilterBar>
          <div className="muted">Periode {formatDate(data.start)} – {formatDate(data.end)}. Rumus draft: {data.cfg.formula}. Safe manhours direset oleh {data.cfg.safeResetCategories.join('/')}.</div>
          <div className="kpi-grid">
            <Kpi label="Manhours" value={fmtNum(data.total.manhours)} icon={Clock} tone="navy" hint={`${data.total.days} hari-site terinput`} />
            <Kpi label="Safe manhours (kumulatif)" value={fmtNum(data.total.safeManhours)} icon={ShieldCheck} tone="green" />
            <Kpi label="Rata-rata manpower / hari-site" value={fmtNum(data.total.avgManpower)} icon={Users} tone="blue" hint={`maks ${fmtNum(data.total.maxManpower)}`} />
            <Kpi label="LTIFR (draft)" value={fmtNum(data.total.ltifr, 2)} icon={Activity} tone={data.total.incidents.LTI ? 'red' : 'orange'} hint={`SR ${fmtNum(data.total.severityRate, 2)}`} />
          </div>
          <Card title="Tren manhours, aktivitas dan kejadian">
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={data.trend} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="#eef0f3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="mh" tick={{ fontSize: 11 }} width={60} />
                  <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="n" dataKey="activities" name="Aktivitas" fill="#2760A8" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="n" dataKey="incidents" name="Kejadian" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="mh" type="monotone" dataKey="manhours" name="Manhours" stroke="#F97316" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid-2">
            <Card title="Aktivitas & observasi" padding={0}>
              <DataTable rows={nonIncident} rowKey={(i) => i.code} columns={[
                { key: 'name', label: 'Indikator' },
                { key: 'count', label: 'Jumlah', num: true, render: (i) => fmtNum(data.total.activities[i.code]?.count ?? 0) },
                { key: 'part', label: 'Peserta', num: true, render: (i) => (i.hasParticipants ? fmtNum(data.total.activities[i.code]?.participants ?? 0) : '-') },
                { key: 'target', label: 'Target/bln', num: true, render: (i) => (i.monthlyTarget ? fmtNum(i.monthlyTarget) : '-') },
              ]} />
            </Card>
            <Card title="Kejadian (dari modul Insiden)" padding={0}>
              <DataTable rows={indicators.filter((i) => i.group === 'INCIDENT')} rowKey={(i) => i.code} columns={[
                { key: 'name', label: 'Kategori' },
                { key: 'count', label: 'Jumlah', num: true, render: (i) => fmtNum(data.total.incidents[i.code] ?? 0) },
              ]} />
            </Card>
          </div>
          <Card title="Rekap per site" padding={0}>
            <DataTable rows={data.perSite} rowKey={(r) => r.site.id} empty="Belum ada data pada periode ini."
              columns={[
                { key: 'site', label: 'Site', render: (r) => <strong>{r.site.code}</strong> },
                { key: 'days', label: 'Hari input', num: true },
                { key: 'mp', label: 'Rata-rata MP', num: true, render: (r) => fmtNum(r.avgManpower) },
                { key: 'mh', label: 'Manhours', num: true, render: (r) => fmtNum(r.manhours) },
                { key: 'smh', label: 'Safe MH', num: true, render: (r) => fmtNum(r.safeManhours) },
                { key: 'act', label: 'Aktivitas', num: true, render: (r) => fmtNum(Object.values(r.activities).reduce((s, a) => s + a.count, 0)) },
                { key: 'inc', label: 'Kejadian', num: true, render: (r) => fmtNum(Object.values(r.incidents).reduce((s, n) => s + n, 0)) },
                { key: 'lti', label: 'LTIFR', num: true, render: (r) => fmtNum(r.ltifr, 2) },
              ]} />
          </Card>
        </>
      )}

      {tab === 'input' && daily && (
        <>
          <FilterBar filters={periodFilters}>
            {canEdit && <button className="btn btn-primary" onClick={() => setDailyForm({ siteId: defaultSite, date: todayIso(), manpower: '', workHours: 10, overtimeHours: 0, excludedHours: 0, notes: '' })}><Plus size={16} /> Input manhours harian</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={daily} empty="Belum ada input harian."
              columns={[
                { key: 'date', label: 'Tanggal', render: (d) => formatDate(d.date) },
                { key: 'site', label: 'Site', render: (d) => d.site.code },
                { key: 'mp', label: 'Manpower', num: true, render: (d) => fmtNum(d.manpower) },
                { key: 'wh', label: 'Jam kerja', num: true, render: (d) => fmtNum(d.workHours, 2) },
                { key: 'ot', label: 'Lembur', num: true, render: (d) => fmtNum(d.overtimeHours, 2) },
                { key: 'ex', label: 'Pengecualian', num: true, render: (d) => fmtNum(d.excludedHours, 2) },
                { key: 'mh', label: 'Manhours', num: true, render: (d) => <strong>{fmtNum(d.manhours, 2)}</strong> },
                { key: 'by', label: 'Pelapor', render: (d) => <span className="muted">{d.reporterName}</span> },
                ...(canEdit ? [{ key: 'e', label: '', render: (d) => <button className="btn btn-ghost btn-sm" onClick={() => setDailyForm({ siteId: d.siteId, date: iso(d.date), manpower: d.manpower, workHours: d.workHours, overtimeHours: d.overtimeHours, excludedHours: d.excludedHours, notes: d.notes ?? '' })}><Edit size={14} /></button> }] : []),
              ]} />
          </div>
        </>
      )}

      {tab === 'activities' && activities && (
        <>
          <FilterBar filters={[...periodFilters, { name: 'indicatorCode', label: 'Indikator', type: 'select', options: nonIncident.map((i) => [i.code, i.name]) }]}>
            {canEdit && <button className="btn btn-primary" onClick={() => { setFiles([]); setActForm({ siteId: defaultSite, date: todayIso(), indicatorCode: nonIncident[0]?.code ?? '', count: 1, participants: '', title: '', location: '', notes: '' }); }}><Plus size={16} /> Catat aktivitas</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={activities.rows} empty="Belum ada aktivitas."
              columns={[
                { key: 'date', label: 'Tanggal', render: (a) => formatDate(a.date) },
                { key: 'site', label: 'Site', render: (a) => a.site.code },
                { key: 'ind', label: 'Indikator', render: (a) => indicators.find((i) => i.code === a.indicatorCode)?.name ?? a.indicatorCode },
                { key: 'title', label: 'Kegiatan', render: (a) => (<div>{a.title ?? '-'}{a.location && <div className="muted">{a.location}</div>}</div>) },
                { key: 'count', label: 'Jumlah', num: true },
                { key: 'part', label: 'Peserta', num: true, render: (a) => a.participants ?? '-' },
                { key: 'files', label: 'Dokumentasi', render: (a) => (a.files.length ? `${a.files.length} file` : '-') },
                {
                  key: 'e', label: '', render: (a) => canEdit && (
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setFiles([]); setActForm({ id: a.id, files: a.files, siteId: a.siteId, date: iso(a.date), indicatorCode: a.indicatorCode, count: a.count, participants: a.participants ?? '', title: a.title ?? '', location: a.location ?? '', notes: a.notes ?? '' }); }}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => (await showConfirm('Hapus aktivitas ini? Tercatat di audit log.')) && submit(`/api/performance/activities/${a.id}`, { method: 'DELETE' })}><Trash2 size={14} /></button>
                    </div>
                  ),
                },
              ]} />
          </div>
          <Pager page={page} total={activities.total} />
        </>
      )}

      {tab === 'indicators' && (
        <>
          <div className="notice">Formula indikator, target dan satuan adalah parameter yang harus disetujui HO. Perubahan definisi mengembalikan status ke Draft.</div>
          <div className="card">
            <DataTable rows={indicators} rowKey={(i) => i.code}
              columns={[
                { key: 'code', label: 'Kode', render: (i) => <code>{i.code}</code> },
                { key: 'name', label: 'Nama' },
                { key: 'group', label: 'Kelompok', render: (i) => labelOf(i.group) },
                { key: 'unit', label: 'Satuan' },
                { key: 'target', label: 'Target/bln', num: true, render: (i) => (i.monthlyTarget ? fmtNum(i.monthlyTarget) : '-') },
                { key: 'def', label: 'Definisi', render: (i) => <span className="muted">{i.definition ?? '-'}</span> },
                { key: 'status', label: 'Status', render: (i) => (<div><Badge value={i.status} label={i.status === 'APPROVED' ? 'Disetujui' : 'Draft'} />{i.approvedBy && <div className="muted">{i.approvedBy}</div>}</div>) },
                ...(canIndicator ? [{ key: 'e', label: '', render: (i) => <button className="btn btn-ghost btn-sm" onClick={() => setIndForm({ code: i.code, name: i.name, unit: i.unit, hasParticipants: i.hasParticipants, monthlyTarget: i.monthlyTarget ?? '', definition: i.definition ?? '', sortOrder: i.sortOrder, isActive: i.isActive, approve: false })}><Edit size={14} /></button> }] : []),
              ]} />
          </div>
        </>
      )}

      <Modal open={Boolean(dailyForm)} onClose={() => setDailyForm(null)} title="Input manhours harian" subtitle="Satu catatan per site per tanggal; input ulang pada tanggal yang sama menjadi koreksi (tercatat).">
        {dailyForm && (
          <form onSubmit={async (e) => { e.preventDefault(); if (await submit('/api/performance/daily', { body: dailyForm })) setDailyForm(null); }} className="stack">
            <FormFields values={dailyForm} setValues={setDailyForm} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: siteOpts, required: true },
              { name: 'date', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
              { name: 'manpower', label: 'Jumlah pekerja', type: 'number', min: 0, required: true },
              { name: 'workHours', label: 'Jam kerja normal / orang', type: 'number', min: 0, max: 24, step: '0.5', required: true },
              { name: 'overtimeHours', label: 'Total jam lembur', type: 'number', min: 0, step: '0.5' },
              { name: 'excludedHours', label: 'Total jam pengecualian', type: 'number', min: 0, step: '0.5', hint: 'Mis. pekerja di site tetapi tidak bekerja.' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div className="notice info">Manhours = <strong>{fmtNum(calcManhours({ manpower: dailyForm.manpower || 0, workHours: dailyForm.workHours || 0, overtimeHours: dailyForm.overtimeHours || 0, excludedHours: dailyForm.excludedHours || 0 }), 2)}</strong></div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(actForm)} onClose={() => setActForm(null)} title={actForm?.id ? 'Koreksi aktivitas' : 'Catat aktivitas HSE'} size="modal-lg">
        {actForm && (
          <form onSubmit={saveActivity} className="stack">
            <FormFields values={actForm} setValues={setActForm} fields={[
              ...(actForm.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', options: siteOpts, required: true }]),
              { name: 'date', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
              { name: 'indicatorCode', label: 'Jenis aktivitas', type: 'select', options: nonIncident.map((i) => [i.code, i.name]), required: true, noEmpty: true },
              { name: 'count', label: 'Jumlah / hasil', type: 'number', min: 1, required: true },
              { name: 'participants', label: 'Jumlah peserta', type: 'number', min: 0, hidden: (v) => !indicators.find((i) => i.code === v.indicatorCode)?.hasParticipants },
              { name: 'title', label: 'Nama kegiatan / temuan' },
              { name: 'location', label: 'Lokasi' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            {actForm.files?.length > 0 && <FileLinks files={actForm.files} />}
            <div className="form-grid"><FileInput label="Foto dokumentasi" accept="image/*,.pdf" capture="environment" onChange={setFiles} /></div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(indForm)} onClose={() => setIndForm(null)} title={`Indikator ${indForm?.code ?? ''}`}>
        {indForm && (
          <form onSubmit={async (e) => { e.preventDefault(); const { code, ...body } = indForm; if (await submit(`/api/performance/indicators/${code}`, { method: 'PUT', body })) setIndForm(null); }}>
            <FormFields values={indForm} setValues={setIndForm} fields={[
              { name: 'name', label: 'Nama', required: true },
              { name: 'unit', label: 'Satuan', required: true },
              { name: 'monthlyTarget', label: 'Target per bulan', type: 'number', min: 0 },
              { name: 'sortOrder', label: 'Urutan', type: 'number', min: 0 },
              { name: 'definition', label: 'Definisi / formula', type: 'textarea', span: true },
              { name: 'hasParticipants', label: 'Mencatat peserta', type: 'checkbox' },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
              { name: 'approve', label: 'Setujui sebagai parameter resmi HO', type: 'checkbox', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
