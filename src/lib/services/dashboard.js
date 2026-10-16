import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { addDays, today } from '../dates.js';
import { fitness } from '../domain/mcu.js';
import { previousMonthKey, sitesNotReported } from '../domain/reports.js';
import { summarize } from '../domain/performance.js';
import { getSetting } from '../settings.js';
import { CATEGORIES, WORK_STATUSES } from '../domain/personnel.js';
import { rosterBoard } from './roster.js';
import { sourceData, periodBounds } from './performance.js';

/** Semua angka diambil dari modul sumber; tidak ada input ulang untuk dashboard. */
export async function dashboard(user, f = {}) {
  const now = today();
  const t = await getSetting('reminder.thresholds');
  const { start, end } = periodBounds(f);
  const personnelWhere = { isFormer: false, ...siteFilter(user, f.siteId, 'currentSiteId') };
  if (f.category && CATEGORIES.includes(f.category)) personnelWhere.category = f.category;
  if (f.workStatus && WORK_STATUSES.includes(f.workStatus)) personnelWhere.workStatus = f.workStatus;
  const siteWhere = { isActive: true, ...siteFilter(user, f.siteId, 'id') };

  const [people, sites, permits, src, openIncidents, reportsMonth, notifications, roster] = await Promise.all([
    prisma.personnel.findMany({
      where: personnelWhere,
      select: { id: true, category: true, workStatus: true, currentSiteId: true, mcus: { where: { isLatest: true }, select: { result: true, validUntil: true, fuDueDate: true }, take: 1 } },
    }),
    prisma.site.findMany({ where: siteWhere, select: { id: true, code: true, name: true, isHo: true } }),
    prisma.permit.findMany({
      where: { revokedAt: null, ...siteFilter(user, f.siteId), personnel: { isFormer: false }, endDate: { gte: addDays(now, -365) } },
      select: { id: true, personnelId: true, endDate: true, startDate: true },
      orderBy: { endDate: 'desc' },
    }),
    sourceData(siteFilter(user, f.siteId), start, end),
    prisma.incident.count({ where: { ...siteFilter(user, f.siteId), status: { not: 'CLOSED' } } }),
    prisma.hseReport.findMany({ where: { type: 'BULANAN', periodKey: previousMonthKey(now), ...siteFilter(user, f.siteId) }, select: { siteId: true, type: true, periodKey: true, status: true } }),
    prisma.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: 'desc' }, take: 6 }),
    rosterBoard(user, { siteId: f.siteId, category: f.category }),
  ]);

  const count = (rows, key) => rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] ?? 0) + 1 }), {});
  const fitnessCounts = count(people.map((p) => ({ f: fitness(p.mcus[0], now) })), 'f');
  // Permit terakhir per personel menentukan status izin bekerja.
  const latestPermit = new Map();
  for (const p of permits) if (!latestPermit.has(p.personnelId)) latestPermit.set(p.personnelId, p);
  const permitCounts = { AKTIF: 0, AKAN_HABIS: 0, KEDALUWARSA: 0 };
  for (const p of latestPermit.values()) {
    if (p.endDate < now) permitCounts.KEDALUWARSA++;
    else if (p.endDate <= addDays(now, t.permit)) permitCounts.AKAN_HABIS++;
    else permitCounts.AKTIF++;
  }
  const perSite = sites.filter((s) => !s.isHo || people.some((p) => p.currentSiteId === s.id)).map((s) => {
    const own = people.filter((p) => p.currentSiteId === s.id);
    return {
      site: s,
      total: own.length,
      categories: count(own, 'category'),
      statuses: count(own, 'workStatus'),
      unfit: own.filter((p) => ['UNFIT', 'MCU_KEDALUWARSA', 'FU_TERLAMBAT'].includes(fitness(p.mcus[0], now))).length,
    };
  });
  const summary = summarize(src);
  const notReported = sitesNotReported(sites, reportsMonth, previousMonthKey(now));
  return {
    period: { start, end },
    totals: { personnel: people.length, categories: count(people, 'category'), statuses: count(people, 'workStatus') },
    fitness: fitnessCounts,
    permits: permitCounts,
    roster: roster.counts,
    hse: { manhours: summary.manhours, activities: Object.values(summary.activities).reduce((s, a) => s + a.count, 0), incidents: summary.incidents, openIncidents, ltifr: summary.ltifr },
    reports: { period: previousMonthKey(now), notReported, submitted: reportsMonth.filter((r) => r.status !== 'DRAFT').length, approved: reportsMonth.filter((r) => r.status === 'APPROVED').length },
    perSite,
    notifications,
  };
}
