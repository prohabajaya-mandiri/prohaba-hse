// Aturan murni modul CSMS (tanpa database) agar dapat diuji.
import { addDays, iso, isoWeekKey, isoWeekRange, monthRange, toDate } from '../dates.js';

export const FREQUENCIES = ['ONCE', 'ON_CHANGE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT', 'CUSTOM'];
export const FREQUENCY_LABELS = {
  ONCE: 'Sekali / awal proyek',
  ON_CHANGE: 'Saat ada perubahan',
  DAILY: 'Harian',
  WEEKLY: 'Mingguan',
  MONTHLY: 'Bulanan',
  YEARLY: 'Tahunan',
  EVENT: 'Sesuai kejadian',
  CUSTOM: 'Jadwal khusus',
};
export const RESPONSIBILITIES = ['HO', 'SITE', 'BERSAMA'];
// PIC dapat berupa bagian tanpa akun aplikasi; HSE bukan pelaksana tunggal.
export const PIC_ROLES = ['HO_HSE', 'HSE_SITE', 'HRD', 'PJO', 'PM', 'LOGISTIK', 'OPERASIONAL', 'MEKANIK', 'ADMIN_LEGAL', 'MANAJEMEN_PROYEK'];
export const FULFILLMENT_STATUSES = ['BELUM', 'DRAFT', 'SUBMITTED', 'REVIEWED', 'REVISION', 'VERIFIED'];
// Status yang masih dapat diubah pengisi (bukti boleh ditambah/dilepas).
export const EDITABLE = ['BELUM', 'DRAFT', 'REVISION'];

const BASELINE_KEY = 'AWAL';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (key) => DATE_RE.test(key) && iso(toDate(key)) === key;

/**
 * Normalisasi periode dari kunci. Kewajiban berkala dicatat per periode sehingga
 * bukti bulan lalu tidak otomatis memenuhi bulan berikutnya.
 */
export function periodOf(frequency, key, { startDate = null, schedule = [] } = {}) {
  if (typeof key !== 'string') return null;
  switch (frequency) {
    case 'ONCE':
    case 'ON_CHANGE':
      // ON_CHANGE: baseline AWAL + satu catatan per tanggal perubahan.
      if (key === BASELINE_KEY) return { periodKey: key, start: startDate ?? toDate('2000-01-01'), end: startDate ?? toDate('2000-01-01') };
      if (frequency === 'ON_CHANGE' && validDate(key)) return { periodKey: key, start: toDate(key), end: toDate(key) };
      return null;
    case 'DAILY':
    case 'EVENT':
      return validDate(key) ? { periodKey: key, start: toDate(key), end: toDate(key) } : null;
    case 'WEEKLY': {
      if (!/^\d{4}-W\d{2}$/.test(key)) return null;
      const { start, end } = isoWeekRange(key);
      return isoWeekKey(start) === key ? { periodKey: key, start, end } : null;
    }
    case 'MONTHLY': {
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(key)) return null;
      const { start, end } = monthRange(key);
      return { periodKey: key, start, end };
    }
    case 'YEARLY': {
      if (!/^20\d{2}$/.test(key)) return null;
      const y = Number(key);
      return { periodKey: key, start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
    }
    case 'CUSTOM': {
      const dates = [...new Set((schedule ?? []).filter(validDate))].sort();
      const i = dates.indexOf(key);
      if (i < 0) return null;
      const start = i === 0 ? (startDate ?? toDate(key)) : addDays(toDate(dates[i - 1]), 1);
      return { periodKey: key, start, end: toDate(key) };
    }
    default:
      return null;
  }
}

/** Tenggat: sekali → tanggal tetap; jadwal khusus → tanggal jadwal; berkala → akhir periode + n hari. */
export function dueDateOf(req, period) {
  if (!period) return null;
  if (req.frequency === 'ONCE' || (req.frequency === 'ON_CHANGE' && period.periodKey === BASELINE_KEY)) return req.dueDate ?? null;
  if (req.frequency === 'CUSTOM') return addDays(period.end, req.dueDays ?? 0);
  return req.dueDays === null || req.dueDays === undefined ? null : addDays(period.end, req.dueDays);
}

/**
 * Periode yang wajib dipenuhi dalam rentang tampilan [from, to].
 * EVENT tidak punya periode wajib: catatan dibuat saat kejadian terjadi.
 */
export function requiredPeriods(req, from, to, { startDate, endDate = null } = {}) {
  const lo = startDate && startDate > from ? startDate : from;
  const hi = endDate && endDate < to ? endDate : to;
  if (lo > hi) return [];
  const ctx = { startDate, schedule: req.schedule };
  const out = [];
  const push = (key) => {
    const p = periodOf(req.frequency, key, ctx);
    if (p && !out.some((x) => x.periodKey === p.periodKey)) out.push({ ...p, dueDate: dueDateOf(req, p) });
  };
  switch (req.frequency) {
    case 'ONCE':
    case 'ON_CHANGE':
      push(BASELINE_KEY);
      break;
    case 'DAILY':
      for (let d = lo; d <= hi; d = addDays(d, 1)) push(iso(d));
      break;
    case 'WEEKLY':
      for (let d = lo; d <= hi; d = addDays(d, 7)) push(isoWeekKey(d));
      push(isoWeekKey(hi));
      break;
    case 'MONTHLY':
      for (let d = new Date(Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1)); d <= hi; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) push(iso(d).slice(0, 7));
      break;
    case 'YEARLY':
      for (let y = lo.getUTCFullYear(); y <= hi.getUTCFullYear(); y++) push(String(y));
      break;
    case 'CUSTOM':
      for (const key of (req.schedule ?? []).filter(validDate)) if (toDate(key) >= lo && toDate(key) <= hi) push(key);
      break;
    default:
      break;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Kunci periode yang sedang berjalan pada tanggal tertentu (dipakai sebagai pilihan awal). */
export function currentPeriodKey(frequency, day) {
  switch (frequency) {
    case 'ONCE':
    case 'ON_CHANGE':
      return BASELINE_KEY;
    case 'DAILY':
    case 'EVENT':
      return iso(day);
    case 'WEEKLY':
      return isoWeekKey(day);
    case 'MONTHLY':
      return iso(day).slice(0, 7);
    case 'YEARLY':
      return iso(day).slice(0, 4);
    default:
      return null;
  }
}

/**
 * Status turunan dihitung terpisah dari status alur: tenggat terlewati dan masa berlaku bukti.
 * `validUntil` = masa berlaku bukti paling awal yang masih ditautkan.
 */
export function derivedFlags({ status, dueDate, validUntil }, today, expiringDays = 30) {
  const flags = [];
  if (dueDate && status !== 'VERIFIED' && !['SUBMITTED', 'REVIEWED'].includes(status) && dueDate < today) flags.push('OVERDUE');
  if (validUntil) {
    if (validUntil < today) flags.push('EVIDENCE_EXPIRED');
    else if (validUntil <= addDays(today, expiringDays)) flags.push('EVIDENCE_EXPIRING');
  }
  return flags;
}

/**
 * Kelengkapan terverifikasi = butir berlaku terverifikasi / butir berlaku × 100%.
 * Bukan nilai assessment dan bukan keputusan kelulusan owner. Tanpa butir berlaku → null ("—").
 */
export function completeness(rows) {
  const applicable = rows.filter((r) => r.applicability === 'APPLICABLE');
  const verified = applicable.filter((r) => r.status === 'VERIFIED').length;
  return { applicable: applicable.length, verified, percent: applicable.length ? Math.round((verified / applicable.length) * 1000) / 10 : null };
}

/** Status ringkas satu butir dari status per periode: periode terburuk yang sudah jatuh tempo menentukan. */
const RANK = { REVISION: 0, BELUM: 1, DRAFT: 2, SUBMITTED: 3, REVIEWED: 4, VERIFIED: 5 };
export function rollupStatus(periodStatuses) {
  if (!periodStatuses.length) return null;
  return periodStatuses.reduce((worst, s) => (RANK[s] < RANK[worst] ? s : worst), 'VERIFIED');
}

/** Cocokkan jumlah nilai maksimum butir dengan angka sumber; selisih dilaporkan, tidak disembunyikan. */
export function maxScoreCheck(items, sourceMax) {
  const total = items.reduce((s, i) => s + (i.maxScore ?? 0), 0);
  return { items: items.length, total, sourceMax: sourceMax ?? null, diff: sourceMax === null || sourceMax === undefined ? null : total - sourceMax };
}
