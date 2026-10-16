'use client';

import Link from 'next/link';
import { Users, HardHat, Building, HeartPulse, BadgeCheck, CalendarClock, Clock, Siren, FileWarning, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { Card, DataTable, FilterBar, Kpi } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { fmtNum, labelOf } from '@/lib/labels';
import { CATEGORIES, WORK_STATUSES } from '@/lib/domain/personnel';

// Warna grafik diredam: hijau K3 sebagai warna utama, aksen lembut seperlunya.
const STATUS_COLORS = { ACTIVE: '#086840', CUTI: '#5b8fc7', SAKIT: '#d08a4a', MCU: '#7fb3a0', RESIGN: '#b3b9c2', DIRUMAHKAN: '#d4b45a', MUTASI: '#8aa5c9' };
const FIT_COLORS = { FIT: '#086840', FOLLOW_UP: '#d4a73a', UNFIT: '#c2453d', PROSES: '#5b8fc7', BELUM_MCU: '#b3b9c2', FU_TERLAMBAT: '#d08a4a', MCU_KEDALUWARSA: '#8f2a24' };

export default function DashboardClient({ sites, data }) {
  const statusData = WORK_STATUSES.map((s) => ({ name: labelOf(s), value: data.totals.statuses[s] ?? 0, key: s })).filter((x) => x.value);
  const fitData = Object.entries(data.fitness).map(([k, v]) => ({ name: labelOf(k), value: v, key: k }));
  const siteChart = data.perSite.map((s) => ({ site: s.site.code, Staff: s.categories.STAFF ?? 0, Manpower: s.categories.MANPOWER ?? 0, 'Harian Kantor': s.categories.HARIAN_KANTOR ?? 0 }));

  return (
    <div className="stack">
      <FilterBar filters={[
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]), allLabel: sites.length > 1 ? 'Semua site' : 'Site saya' },
        { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES },
        { name: 'workStatus', label: 'Status kerja', type: 'select', options: WORK_STATUSES },
        { name: 'from', label: 'Periode HSE dari', type: 'date' },
        { name: 'to', label: 'sampai', type: 'date' },
      ]} />

      <div className="kpi-grid">
        <Kpi label="Total personel" value={fmtNum(data.totals.personnel)} icon={Users} tone="navy" href="/personnel" />
        <Kpi label="Staff" value={fmtNum(data.totals.categories.STAFF ?? 0)} icon={Building} tone="blue" href="/personnel?category=STAFF" />
        <Kpi label="Manpower" value={fmtNum(data.totals.categories.MANPOWER ?? 0)} icon={HardHat} tone="orange" href="/personnel?category=MANPOWER" />
        <Kpi label="Harian kantor" value={fmtNum(data.totals.categories.HARIAN_KANTOR ?? 0)} icon={Users} tone="green" href="/personnel?category=HARIAN_KANTOR" />
      </div>

      <div className="kpi-grid">
        <Kpi label="FIT / FOLLOW UP / UNFIT" value={`${data.fitness.FIT ?? 0} / ${data.fitness.FOLLOW_UP ?? 0} / ${data.fitness.UNFIT ?? 0}`} icon={HeartPulse} tone="green" href="/mcu?latest=1" hint={`${(data.fitness.FU_TERLAMBAT ?? 0) + (data.fitness.MCU_KEDALUWARSA ?? 0)} perlu tindak lanjut`} />
        <Kpi label="Permit aktif / akan habis / kedaluwarsa" value={`${data.permits.AKTIF} / ${data.permits.AKAN_HABIS} / ${data.permits.KEDALUWARSA}`} icon={BadgeCheck} tone={data.permits.KEDALUWARSA ? 'red' : 'blue'} href="/permits?status=AKAN_HABIS" />
        <Kpi label="Roster: mendekati / lewat jadwal cuti" value={`${data.roster.MENDEKATI_CUTI ?? 0} / ${data.roster.LEWAT_JADWAL ?? 0}`} icon={CalendarClock} tone="yellow" href="/roster" hint={`${data.roster.SEDANG_CUTI ?? 0} sedang cuti/off`} />
        <Kpi label={`Laporan bulanan ${data.reports.period}`} value={`${data.reports.submitted} masuk · ${data.reports.approved} sah`} icon={FileWarning} tone={data.reports.notReported.length ? 'red' : 'green'} href="/reports" hint={data.reports.notReported.length ? `${data.reports.notReported.length} site belum melapor` : 'Semua site melapor'} />
      </div>

      <div className="kpi-grid">
        <Kpi label="Manhours periode" value={fmtNum(data.hse.manhours)} icon={Clock} tone="navy" href="/performance" hint={`${formatDate(data.period.start)} – ${formatDate(data.period.end)}`} />
        <Kpi label="Aktivitas HSE" value={fmtNum(data.hse.activities)} icon={Activity} tone="blue" href="/performance?tab=activities" />
        <Kpi label="Kejadian periode" value={fmtNum(Object.values(data.hse.incidents).reduce((a, b) => a + b, 0))} icon={Siren} tone="orange" href="/incidents" hint={Object.entries(data.hse.incidents).map(([k, v]) => `${labelOf(k)} ${v}`).join(' · ') || 'Nihil'} />
        <Kpi label="Insiden belum ditutup" value={fmtNum(data.hse.openIncidents)} icon={Siren} tone={data.hse.openIncidents ? 'red' : 'green'} href="/incidents?status=OPEN" />
      </div>

      <div className="grid-2">
        <Card title="Status kerja">
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Kelayakan kesehatan (MCU terbaru)">
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={fitData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {fitData.map((d) => <Cell key={d.key} fill={FIT_COLORS[d.key] ?? '#b3b9c2'} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {siteChart.length > 1 && (
        <Card title="Personel per site">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={siteChart}>
                <CartesianGrid stroke="#e3e6eb" vertical={false} />
                <XAxis dataKey="site" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Staff" stackId="a" fill="#086840" />
                <Bar dataKey="Manpower" stackId="a" fill="#5fa883" />
                <Bar dataKey="Harian Kantor" stackId="a" fill="#b7d3c3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="Rekap per site" padding={0}>
        <DataTable rows={data.perSite} rowKey={(r) => r.site.id} empty="Belum ada site."
          columns={[
            { key: 'site', label: 'Site', render: (r) => (<div><strong>{r.site.code}</strong><div className="muted">{r.site.name}</div></div>) },
            { key: 'total', label: 'Total', num: true },
            ...CATEGORIES.map((c) => ({ key: c, label: labelOf(c), num: true, render: (r) => r.categories[c] ?? 0 })),
            ...WORK_STATUSES.map((s) => ({ key: 's' + s, label: labelOf(s), num: true, render: (r) => r.statuses[s] ?? 0 })),
            { key: 'unfit', label: 'Perlu tindak lanjut MCU', num: true, render: (r) => (r.unfit ? <span className="text-red">{r.unfit}</span> : 0) },
          ]} />
      </Card>

      <div className="grid-2">
        <Card title="Site belum mengirim laporan bulanan" padding={data.reports.notReported.length ? 16 : 20}>
          {data.reports.notReported.length === 0 ? <span className="text-green">Semua site sudah melapor untuk {data.reports.period}.</span>
            : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{data.reports.notReported.map((s) => <span key={s.id} className="chip">{s.code}</span>)}</div>}
        </Card>
        <Card title="Notifikasi terbaru" actions={<Link href="/notifications" className="btn btn-ghost btn-sm">Semua</Link>} padding={0}>
          {data.notifications.length === 0 && <div style={{ padding: 20 }} className="muted">Tidak ada notifikasi baru.</div>}
          {data.notifications.map((n) => (
            <Link key={n.id} href={n.link ?? '/notifications'} style={{ display: 'block', padding: '10px 16px', borderBottom: '1px solid var(--gray-100)', textDecoration: 'none' }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: n.severity === 'DANGER' ? 'var(--red-600)' : 'var(--gray-900)' }}>{n.title}</div>
              <div className="muted">{n.body}</div>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
