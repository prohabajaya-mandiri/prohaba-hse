import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, daysBetween, iso, isoWeekKey, monthKey, today } from '../dates.js';
import { calcManhours, safeManhours, summarize, trend } from '../domain/performance.js';
import { getSetting } from '../settings.js';
import { bool, choice, date, ensure, InputError, int, number, object, optionalNumber, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite } from './common.js';
import { logApproval } from './notify.js';

export const listIndicators = (all = false) =>
  prisma.indicator.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] });

// Target & definisi indikator ditetapkan HO; perubahan mengembalikan status ke DRAFT sampai disetujui.
export async function saveIndicator(user, code, body) {
  ensure(user.role === 'HO_HSE', 'Indikator diatur HO HSE.', 403);
  object(body, ['name', 'unit', 'hasParticipants', 'monthlyTarget', 'definition', 'sortOrder', 'isActive', 'approve']);
  return prisma.$transaction(async (tx) => {
    const before = await tx.indicator.findUnique({ where: { code } });
    ensure(before, 'Indikator tidak ditemukan.', 404);
    const data = {
      name: text(body.name ?? before.name, 'Nama', 100),
      unit: text(body.unit ?? before.unit, 'Satuan', 30),
      hasParticipants: body.hasParticipants === undefined ? before.hasParticipants : bool(body.hasParticipants),
      monthlyTarget: optionalNumber(body.monthlyTarget, 'Target', 0, 1e9),
      definition: text(body.definition, 'Definisi', 1000, true),
      sortOrder: body.sortOrder === undefined ? before.sortOrder : int(body.sortOrder, 'Urutan', 0, 999),
      isActive: body.isActive === undefined ? before.isActive : bool(body.isActive),
    };
    const d = diff(before, data);
    const approve = bool(body.approve);
    const row = await tx.indicator.update({
      where: { code },
      data: { ...data, ...(approve ? { status: 'APPROVED', approvedBy: actorName(user), approvedAt: new Date() } : d.changed ? { status: 'DRAFT', approvedBy: null, approvedAt: null } : {}) },
    });
    if (approve) await logApproval(tx, user, { entityType: 'INDICATOR', entityId: code, step: 'APPROVE', decision: 'APPROVE' });
    await audit(tx, user, { action: approve ? 'APPROVE' : 'UPDATE', module: 'performance', recordId: code, ...d });
    return row;
  });
}

async function assertEditable(user, d) {
  const cfg = await getSetting('performance.manhours');
  ensure(d <= today(), 'Tanggal tidak boleh di masa depan.');
  // Batas input: HSE Site hanya dapat menginput/koreksi N hari ke belakang; HO dapat mengoreksi kapan pun.
  if (user.role !== 'HO_HSE' && daysBetween(d, today()) > (cfg.inputLockDays ?? 7)) {
    throw new InputError(`Input/koreksi lebih dari ${cfg.inputLockDays} hari ke belakang harus melalui HO HSE.`, 403);
  }
}

export async function saveDaily(user, body) {
  object(body, ['siteId', 'date', 'manpower', 'workHours', 'overtimeHours', 'excludedHours', 'notes']);
  const siteId = requireSite(user, body.siteId);
  const d = date(body.date);
  await assertEditable(user, d);
  const v = {
    manpower: int(body.manpower, 'Jumlah manpower', 0, 100000),
    workHours: number(body.workHours, 'Jam kerja', 0, 24),
    overtimeHours: optionalNumber(body.overtimeHours, 'Jam lembur', 0, 1e7) ?? 0,
    excludedHours: optionalNumber(body.excludedHours, 'Jam pengecualian', 0, 1e7) ?? 0,
    notes: text(body.notes, 'Catatan', 500, true),
  };
  v.manhours = calcManhours(v);
  return prisma.$transaction(async (tx) => {
    const before = await tx.dailyPerformance.findUnique({ where: { siteId_date: { siteId, date: d } } });
    const row = await tx.dailyPerformance.upsert({
      where: { siteId_date: { siteId, date: d } },
      create: { ...v, siteId, date: d, reportedBy: user.id, reporterName: actorName(user) },
      update: { ...v, reportedBy: user.id, reporterName: actorName(user) },
    });
    await audit(tx, user, { action: before ? 'UPDATE' : 'CREATE', module: 'performance', recordId: row.id, siteId, ...(before ? diff(before, v) : { after: { date: iso(d), ...v } }), note: before ? 'Koreksi data harian' : null });
    return row;
  });
}

const ACTIVITY_FIELDS = ['siteId', 'date', 'indicatorCode', 'count', 'participants', 'title', 'location', 'notes'];
async function parseActivity(body) {
  object(body, ACTIVITY_FIELDS);
  const indicator = await prisma.indicator.findUnique({ where: { code: String(body.indicatorCode ?? '') } });
  ensure(indicator?.isActive && indicator.group !== 'INCIDENT', 'Indikator tidak valid (kejadian dicatat di modul Insiden).');
  return {
    date: date(body.date),
    indicatorCode: indicator.code,
    count: int(body.count ?? 1, 'Jumlah', 1, 10000),
    participants: indicator.hasParticipants ? int(body.participants ?? 0, 'Peserta', 0, 100000) : null,
    title: text(body.title, 'Kegiatan', 200, true),
    location: text(body.location, 'Lokasi', 200, true),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
}

export async function createActivity(user, body, files) {
  const siteId = requireSite(user, body.siteId);
  const v = await parseActivity(body);
  await assertEditable(user, v.date);
  return prisma.$transaction(async (tx) => {
    const row = await tx.hseActivity.create({ data: { ...v, siteId, reportedBy: user.id, reporterName: actorName(user) } });
    await attachFiles(tx, user, files, { entityType: 'ACTIVITY', entityId: row.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'performance', recordId: row.id, siteId, after: v });
    return row;
  }, { timeout: 20000 });
}

export async function updateActivity(user, activityId, body, files) {
  const before = await prisma.hseActivity.findUnique({ where: { id: activityId } });
  ensure(before, 'Aktivitas tidak ditemukan.', 404);
  requireSite(user, before.siteId);
  await assertEditable(user, before.date);
  const v = await parseActivity({ ...body, siteId: undefined });
  await assertEditable(user, v.date);
  return prisma.$transaction(async (tx) => {
    const row = await tx.hseActivity.update({ where: { id: activityId }, data: v });
    await attachFiles(tx, user, files, { entityType: 'ACTIVITY', entityId: row.id, siteId: before.siteId });
    await audit(tx, user, { action: 'UPDATE', module: 'performance', recordId: activityId, siteId: before.siteId, ...diff(before, v), note: 'Koreksi aktivitas' });
    return row;
  }, { timeout: 20000 });
}

export async function deleteActivity(user, activityId) {
  const before = await prisma.hseActivity.findUnique({ where: { id: activityId } });
  ensure(before, 'Aktivitas tidak ditemukan.', 404);
  requireSite(user, before.siteId);
  await assertEditable(user, before.date);
  await prisma.$transaction(async (tx) => {
    await tx.hseActivity.delete({ where: { id: activityId } });
    await audit(tx, user, { action: 'DELETE', module: 'performance', recordId: activityId, siteId: before.siteId, before });
  });
  return { ok: true };
}

// ─── Rekap ──────────────────────────────────────────────────────────────────
export function periodBounds(f) {
  const end = f.to ? date(f.to, 'Sampai') : today();
  const start = f.from ? date(f.from, 'Dari') : addDays(end, -29);
  ensure(start <= end && daysBetween(start, end) <= 400, 'Rentang periode maksimal 400 hari.');
  return { start, end };
}

/** Data sumber untuk satu periode — dipakai rekap performance & laporan HSE (tanpa input ulang). */
export async function sourceData(siteWhereClause, start, end) {
  const range = { gte: start, lte: end };
  const [daily, activities, incidents] = await Promise.all([
    prisma.dailyPerformance.findMany({ where: { ...siteWhereClause, date: range }, orderBy: { date: 'asc' } }),
    prisma.hseActivity.findMany({ where: { ...siteWhereClause, date: range }, orderBy: { date: 'asc' } }),
    prisma.incident.findMany({ where: { ...siteWhereClause, occurredAt: { gte: start, lt: addDays(end, 1) } }, select: { id: true, number: true, siteId: true, occurredAt: true, category: true, title: true, status: true, lostDays: true } }),
  ]);
  return { daily, activities, incidents };
}

export async function recap(user, f) {
  const { start, end } = periodBounds(f);
  const scope = siteFilter(user, f.siteId);
  const granularity = choice(f.granularity ?? 'daily', ['daily', 'weekly', 'monthly'], 'Rekap');
  const [src, indicators, cfg, sites] = await Promise.all([
    sourceData(scope, start, end),
    listIndicators(),
    getSetting('performance.manhours'),
    prisma.site.findMany({ where: scope.siteId ? { id: scope.siteId } : {}, select: { id: true, code: true, name: true } }),
  ]);
  const keyFn = granularity === 'daily' ? (d) => iso(d) : granularity === 'weekly' ? (d) => isoWeekKey(d) : (d) => monthKey(d);
  // Safe manhours kumulatif sampai akhir periode (sejak kejadian reset terakhir).
  const [allDaily, resetIncidents] = await Promise.all([
    prisma.dailyPerformance.findMany({ where: { ...scope, date: { lte: end } }, select: { date: true, manhours: true, siteId: true } }),
    prisma.incident.findMany({ where: { ...scope, category: { in: cfg.safeResetCategories }, occurredAt: { lte: addDays(end, 1) } }, select: { occurredAt: true, category: true, siteId: true } }),
  ]);
  const perSite = sites.map((s) => {
    const own = (rows) => rows.filter((r) => r.siteId === s.id);
    const sum = summarize({ daily: own(src.daily), activities: own(src.activities), incidents: own(src.incidents) });
    return { site: s, ...sum, safeManhours: safeManhours(own(allDaily), own(resetIncidents), cfg.safeResetCategories, end) };
  }).filter((r) => r.days || Object.keys(r.activities).length || Object.keys(r.incidents).length);
  const total = summarize(src);
  // Safe manhours gabungan = jumlah per site (tiap site direset oleh kejadian di site tersebut).
  total.safeManhours = sites.reduce((s, site) => s + safeManhours(allDaily.filter((r) => r.siteId === site.id), resetIncidents.filter((r) => r.siteId === site.id), cfg.safeResetCategories, end), 0);
  return {
    start, end, granularity, indicators, cfg,
    total, perSite,
    trend: trend(src.daily, src.activities, src.incidents, keyFn),
    daily: src.daily, activities: src.activities, incidents: src.incidents,
  };
}

export async function listActivities(user, f, { skip = 0, take = 50 } = {}) {
  const { start, end } = periodBounds(f);
  const where = { ...siteFilter(user, f.siteId), date: { gte: start, lte: end } };
  if (f.indicatorCode) where.indicatorCode = String(f.indicatorCode);
  const [rows, total] = await Promise.all([
    prisma.hseActivity.findMany({ where, skip, take, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: { site: { select: { code: true } } } }),
    prisma.hseActivity.count({ where }),
  ]);
  const files = groupBy(await filesOf('ACTIVITY', rows.map((r) => r.id)), 'entityId');
  return { rows: rows.map((r) => ({ ...r, files: files[r.id] ?? [] })), total };
}

export async function listDaily(user, f) {
  const { start, end } = periodBounds(f);
  return prisma.dailyPerformance.findMany({ where: { ...siteFilter(user, f.siteId), date: { gte: start, lte: end } }, orderBy: [{ date: 'desc' }], include: { site: { select: { code: true } } }, take: 400 });
}

export async function exportRecap(user, f) {
  const r = await recap(user, f);
  const names = Object.fromEntries(r.indicators.map((i) => [i.code, i.name]));
  const siteCode = Object.fromEntries(r.perSite.map((s) => [s.site.id, s.site.code]));
  const wb = XLSX.utils.book_new();
  const summary = r.perSite.map((s) => ({
    Site: s.site.code, 'Hari input': s.days, 'Rata-rata manpower': s.avgManpower, Manhours: s.manhours, 'Safe manhours': s.safeManhours,
    ...Object.fromEntries(r.indicators.filter((i) => i.group !== 'INCIDENT').map((i) => [i.name, s.activities[i.code]?.count ?? 0])),
    ...Object.fromEntries(r.indicators.filter((i) => i.group === 'INCIDENT').map((i) => [i.name, s.incidents[i.code] ?? 0])),
    'LTIFR (draft)': s.ltifr, 'Severity Rate (draft)': s.severityRate,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Rekap per site');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.trend.map((t) => ({ Periode: t.period, Manhours: t.manhours, Aktivitas: t.activities, Kejadian: t.incidents }))), 'Tren');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.daily.map((d) => ({ Tanggal: iso(d.date), Site: siteCode[d.siteId] ?? d.siteId, Manpower: d.manpower, 'Jam kerja': d.workHours, Lembur: d.overtimeHours, Pengecualian: d.excludedHours, Manhours: d.manhours, Pelapor: d.reporterName }))), 'Harian');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.activities.map((a) => ({ Tanggal: iso(a.date), Site: siteCode[a.siteId] ?? a.siteId, Indikator: names[a.indicatorCode] ?? a.indicatorCode, Jumlah: a.count, Peserta: a.participants, Kegiatan: a.title, Lokasi: a.location, Pelapor: a.reporterName }))), 'Aktivitas');
  await audit(null, user, { action: 'EXPORT', module: 'performance', note: `Rekap ${iso(r.start)} s/d ${iso(r.end)}` });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
