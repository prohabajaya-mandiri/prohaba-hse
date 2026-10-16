import { iso } from '../dates.js';

export const INCIDENT_INDICATORS = ['NEAR_MISS', 'FAC', 'MTC', 'LTI', 'FATALITY'];

// Rumus draft (perlu persetujuan HO): manpower × jam kerja normal + lembur − pengecualian.
export function calcManhours({ manpower, workHours, overtimeHours = 0, excludedHours = 0 }) {
  const value = Number(manpower) * Number(workHours) + Number(overtimeHours) - Number(excludedHours);
  return Math.max(0, Math.round(value * 100) / 100);
}

/**
 * Safe manhours: akumulasi manhours sejak kejadian terakhir dengan kategori reset (default LTI/Fatality).
 * `daily` = [{date, manhours}], `incidents` = [{occurredAt, category}].
 */
export function safeManhours(daily, incidents, resetCategories = ['LTI', 'FATALITY'], upTo = null) {
  const resets = incidents
    .filter((i) => resetCategories.includes(i.category))
    .map((i) => iso(i.occurredAt))
    .sort();
  const lastReset = resets.filter((d) => !upTo || d <= iso(upTo)).pop() ?? null;
  return daily
    .filter((r) => (!lastReset || iso(r.date) > lastReset) && (!upTo || iso(r.date) <= iso(upTo)))
    .reduce((sum, r) => sum + Number(r.manhours), 0);
}

/** Rekap periode dari data sumber (tanpa input ulang). Aktivitas dijumlah per indikator sekali saja. */
export function summarize({ daily, activities, incidents }) {
  const byIndicator = {};
  for (const a of activities) {
    const row = (byIndicator[a.indicatorCode] ??= { count: 0, participants: 0, entries: 0 });
    row.count += Number(a.count);
    row.participants += Number(a.participants ?? 0);
    row.entries += 1;
  }
  const incidentsByCategory = {};
  for (const i of incidents) incidentsByCategory[i.category] = (incidentsByCategory[i.category] ?? 0) + 1;
  const manhours = daily.reduce((s, r) => s + Number(r.manhours), 0);
  const days = daily.length;
  const avgManpower = days ? Math.round(daily.reduce((s, r) => s + Number(r.manpower), 0) / days) : 0;
  const maxManpower = daily.reduce((m, r) => Math.max(m, Number(r.manpower)), 0);
  const lti = incidentsByCategory.LTI ?? 0;
  const lostDays = incidents.reduce((s, i) => s + Number(i.lostDays ?? 0), 0);
  return {
    days,
    manhours: Math.round(manhours * 100) / 100,
    avgManpower,
    maxManpower,
    activities: byIndicator,
    incidents: incidentsByCategory,
    // Indikator draft: LTIFR & Severity Rate per 1.000.000 jam kerja (definisi final mengikuti owner).
    ltifr: manhours ? Math.round((lti * 1_000_000 / manhours) * 100) / 100 : 0,
    severityRate: manhours ? Math.round((lostDays * 1_000_000 / manhours) * 100) / 100 : 0,
  };
}

/** Tren harian/mingguan/bulanan untuk grafik. keyFn memetakan tanggal ke label periode. */
export function trend(daily, activities, incidents, keyFn) {
  const map = new Map();
  const get = (k) => {
    if (!map.has(k)) map.set(k, { period: k, manhours: 0, activities: 0, incidents: 0 });
    return map.get(k);
  };
  daily.forEach((r) => (get(keyFn(r.date)).manhours += Number(r.manhours)));
  activities.forEach((a) => (get(keyFn(a.date)).activities += Number(a.count)));
  incidents.forEach((i) => (get(keyFn(i.occurredAt)).incidents += 1));
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}
