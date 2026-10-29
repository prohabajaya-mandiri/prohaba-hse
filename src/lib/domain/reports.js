import { iso, isoWeekKey, isoWeekRange, monthRange, toDate } from '../dates.js';

export const REPORT_TYPES = ['HARIAN', 'MINGGUAN', 'BULANAN'];
// Laporan baru hanya bulanan; harian/mingguan lama tetap bisa dibuka & difilter.
export const CREATABLE_REPORT_TYPES = ['BULANAN'];
export const REPORT_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Dikirim',
  REVIEWED: 'Diperiksa PJO/PM',
  REVISION: 'Perlu revisi',
  APPROVED: 'Disahkan HO',
};

/** Normalisasi periode laporan dari kunci periode: 2026-10-16 | 2026-W42 | 2026-10. */
export function reportPeriod(type, key, deadlineDay = 10) {
  if (type === 'HARIAN') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const d = toDate(key);
    if (iso(d) !== key) return null;
    return { periodKey: key, start: d, end: d, dueDate: null };
  }
  if (type === 'MINGGUAN') {
    if (!/^\d{4}-W\d{2}$/.test(key)) return null;
    const { start, end } = isoWeekRange(key);
    if (isoWeekKey(start) !== key) return null;
    return { periodKey: key, start, end, dueDate: null };
  }
  if (type === 'BULANAN') {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(key)) return null;
    const { start, end } = monthRange(key);
    // Batas laporan bulanan: tanggal 10 bulan berikutnya.
    const dueDate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, deadlineDay));
    return { periodKey: key, start, end, dueDate };
  }
  return null;
}

export function previousMonthKey(today) {
  const d = new Date(today);
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return iso(p).slice(0, 7);
}

/** Site yang belum mengirim laporan bulanan untuk periode tertentu. */
export function sitesNotReported(sites, reports, periodKey) {
  const done = new Set(
    reports.filter((r) => r.type === 'BULANAN' && r.periodKey === periodKey && r.status !== 'DRAFT').map((r) => r.siteId),
  );
  return sites.filter((s) => !s.isHo && !done.has(s.id));
}
