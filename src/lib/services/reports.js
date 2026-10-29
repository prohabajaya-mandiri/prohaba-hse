import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { reportTransition, siteFilter, siteScope } from '../access.js';
import { actorName, audit } from '../audit.js';
import { addDays, iso, today } from '../dates.js';
import { CREATABLE_REPORT_TYPES, previousMonthKey, reportPeriod, REPORT_TYPES, sitesNotReported } from '../domain/reports.js';
import { safeManhours, summarize } from '../domain/performance.js';
import { getSetting } from '../settings.js';
import { choice, ensure, InputError, object, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite } from './common.js';
import { logApproval, notifyRoles } from './notify.js';
import { listIndicators, sourceData } from './performance.js';

/** Ringkasan laporan diambil dari HSE Performance + Insiden (tanpa input ulang). */
export async function buildSummary(siteId, start, end) {
  const [src, site, cfg, indicators] = await Promise.all([
    sourceData({ siteId }, start, end),
    prisma.site.findUnique({ where: { id: siteId }, include: { projects: { where: { status: 'ACTIVE' } }, responsibles: { where: { endDate: null } } } }),
    getSetting('performance.manhours'),
    listIndicators(),
  ]);
  const [allDaily, resets, incidentDetail, activeManpower] = await Promise.all([
    prisma.dailyPerformance.findMany({ where: { siteId, date: { lte: end } }, select: { date: true, manhours: true } }),
    prisma.incident.findMany({ where: { siteId, category: { in: cfg.safeResetCategories }, occurredAt: { lte: addDays(end, 1) } }, select: { occurredAt: true, category: true } }),
    prisma.incident.findMany({
      where: { siteId, occurredAt: { gte: start, lt: addDays(end, 1) } }, orderBy: { occurredAt: 'asc' },
      select: { number: true, occurredAt: true, category: true, title: true, status: true, actions: { select: { description: true, pic: true, dueDate: true, status: true } } },
    }),
    prisma.placement.groupBy({ by: ['siteId'], where: { siteId, status: 'ACTIVE' }, _count: true }),
  ]);
  const names = Object.fromEntries(indicators.map((i) => [i.code, i.name]));
  const s = summarize(src);
  return {
    identity: {
      siteCode: site.code, siteName: site.name,
      projects: site.projects.map((p) => ({ name: p.name, owner: p.owner })),
      responsibles: Object.fromEntries(site.responsibles.map((r) => [r.role, r.name])),
    },
    period: { start: iso(start), end: iso(end) },
    manpower: { registered: activeManpower[0]?._count ?? 0, average: s.avgManpower, max: s.maxManpower },
    manhours: s.manhours,
    safeManhours: safeManhours(allDaily, resets, cfg.safeResetCategories, end),
    ltifr: s.ltifr,
    severityRate: s.severityRate,
    activities: Object.entries(s.activities).map(([code, a]) => ({ code, name: names[code] ?? code, ...a })),
    activityDetail: src.activities.map((a) => ({ id: a.id, date: iso(a.date), name: names[a.indicatorCode] ?? a.indicatorCode, title: a.title, participants: a.participants, count: a.count })),
    incidents: s.incidents,
    incidentDetail: incidentDetail.map((i) => ({ ...i, occurredAt: i.occurredAt.toISOString() })),
  };
}

export async function listReports(user, f, { skip = 0, take = 50 } = {}) {
  const deadline = await getSetting('report.monthlyDeadlineDay');
  const where = { ...siteFilter(user, f.siteId) };
  if (f.type && REPORT_TYPES.includes(f.type)) where.type = f.type;
  if (f.status) where.status = String(f.status);
  // Antrian sesuai peran: PJO/PM memeriksa yang dikirim; HO mengesahkan yang sudah diperiksa.
  if (f.queue === '1') where.status = ['PJO', 'PM'].includes(user.role) ? 'SUBMITTED' : user.role === 'HO_HSE' ? 'REVIEWED' : { in: ['DRAFT', 'REVISION'] };
  const period = f.period && /^20\d{2}-(0[1-9]|1[0-2])$/.test(f.period) ? f.period : previousMonthKey(today());
  const scope = siteScope(user);
  const [rows, total, sites, monthly] = await Promise.all([
    prisma.hseReport.findMany({ where, skip, take, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], include: { site: { select: { code: true, name: true } } } }),
    prisma.hseReport.count({ where }),
    prisma.site.findMany({ where: { isActive: true, isHo: false, ...(scope === null ? {} : { id: { in: scope } }) }, select: { id: true, code: true, name: true, isHo: true } }),
    prisma.hseReport.findMany({ where: { type: 'BULANAN', periodKey: period }, select: { siteId: true, type: true, periodKey: true, status: true } }),
  ]);
  const p = reportPeriod('BULANAN', period, deadline);
  return { rows, total, period, dueDate: p.dueDate, overdue: today() > p.dueDate, notReported: sitesNotReported(sites, monthly, period), deadline };
}

export async function createReport(user, body) {
  object(body, ['siteId', 'type', 'periodKey']);
  ensure(user.role === 'HSE_SITE' || user.role === 'HO_HSE', 'Laporan dibuat oleh HSE Site.', 403);
  const siteId = requireSite(user, body.siteId);
  const type = choice(body.type, CREATABLE_REPORT_TYPES, 'Jenis laporan');
  const deadline = await getSetting('report.monthlyDeadlineDay');
  const p = reportPeriod(type, String(body.periodKey ?? ''), deadline);
  ensure(p, 'Periode tidak valid (bulanan YYYY-MM).');
  ensure(p.start <= today(), 'Periode belum dimulai.');
  return prisma.$transaction(async (tx) => {
    const row = await tx.hseReport.create({
      data: { siteId, type, periodKey: p.periodKey, periodStart: p.start, periodEnd: p.end, dueDate: p.dueDate, createdBy: user.id, creatorName: actorName(user) },
    });
    await tx.hseReportHistory.create({ data: { reportId: row.id, version: 1, action: 'CREATE', actorName: actorName(user) } });
    await audit(tx, user, { action: 'CREATE', module: 'reports', recordId: row.id, siteId, after: { type, periodKey: p.periodKey } });
    return row;
  });
}

async function loadReport(user, reportId) {
  const r = await prisma.hseReport.findUnique({ where: { id: reportId }, include: { site: { select: { code: true, name: true } }, history: { orderBy: { createdAt: 'asc' } } } });
  ensure(r, 'Laporan tidak ditemukan.', 404);
  requireSite(user, r.siteId);
  return r;
}

export async function getReport(user, reportId) {
  const r = await loadReport(user, reportId);
  // Draft/revisi memakai data terkini; laporan terkirim memakai snapshot saat dikirim.
  const live = ['DRAFT', 'REVISION'].includes(r.status);
  const summary = live || !r.summary ? await buildSummary(r.siteId, r.periodStart, r.periodEnd) : r.summary;
  const actFiles = await filesOf('ACTIVITY', summary.activityDetail.map((a) => a.id));
  const files = await filesOf('REPORT', [r.id]);
  return { ...r, summary, live, files, activityFiles: groupBy(actFiles, 'entityId') };
}

export async function updateReport(user, reportId, body, files) {
  object(body, ['narrative', 'constraints', 'nextPlan', 'incidentNote']);
  const r = await loadReport(user, reportId);
  ensure(['DRAFT', 'REVISION'].includes(r.status), 'Laporan yang sudah dikirim tidak dapat diedit.', 409);
  ensure(['HSE_SITE', 'HO_HSE'].includes(user.role), 'Laporan diisi oleh HSE Site.', 403);
  const v = {
    narrative: text(body.narrative, 'Ringkasan aktivitas', 10000, true),
    constraints: text(body.constraints, 'Kendala', 5000, true),
    nextPlan: text(body.nextPlan, 'Rencana periode berikutnya', 5000, true),
    incidentNote: text(body.incidentNote, 'Catatan kejadian', 5000, true),
  };
  return prisma.$transaction(async (tx) => {
    await tx.hseReport.update({ where: { id: reportId }, data: v });
    await attachFiles(tx, user, files, { entityType: 'REPORT', entityId: reportId, siteId: r.siteId });
    await audit(tx, user, { action: 'UPDATE', module: 'reports', recordId: reportId, siteId: r.siteId, after: v });
    return { ok: true };
  }, { timeout: 20000 });
}

export async function transitionReport(user, reportId, body) {
  object(body, ['action', 'note']);
  const action = String(body.action ?? '');
  const r = await loadReport(user, reportId);
  const rule = reportTransition(user.role, action, r.status);
  if (!rule) throw new InputError('Aksi tidak diizinkan untuk peran atau status laporan ini.', 403);
  const isReturn = action.startsWith('RETURN');
  const note = text(body.note, 'Catatan', 2000, !isReturn);
  const name = actorName(user);
  // Snapshot dihitung sebelum transaksi agar tidak meminta koneksi kedua saat transaksi terbuka.
  let snapshot = null;
  if (action === 'SUBMIT') {
    ensure(r.narrative || r.constraints || r.nextPlan, 'Isi ringkasan, kendala atau rencana sebelum mengirim.');
    snapshot = await buildSummary(r.siteId, r.periodStart, r.periodEnd);
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.hseReport.findUnique({ where: { id: reportId }, select: { status: true } });
    ensure(current.status === r.status, 'Status laporan berubah; muat ulang halaman.', 409);
    const data = { status: rule.to };
    if (action === 'SUBMIT') {
      Object.assign(data, { summary: snapshot, submittedAt: new Date(), version: r.status === 'REVISION' ? r.version + 1 : r.version, reviewedAt: null, reviewerName: null, approvedAt: null, approverName: null });
    }
    if (action === 'REVIEW' || action === 'RETURN_REVIEW') Object.assign(data, { reviewedAt: new Date(), reviewerName: name, reviewNote: note });
    if (action === 'APPROVE' || action === 'RETURN_APPROVE') Object.assign(data, { approvedAt: action === 'APPROVE' ? new Date() : null, approverName: name, approveNote: note });
    const row = await tx.hseReport.update({ where: { id: reportId }, data });
    // Arsip versi: setiap transisi menyimpan snapshot isi laporan; versi disahkan menjadi arsip resmi.
    await tx.hseReportHistory.create({
      data: {
        reportId, version: row.version, action: { SUBMIT: 'SUBMIT', REVIEW: 'REVIEW', RETURN_REVIEW: 'REVISION', APPROVE: 'APPROVE', RETURN_APPROVE: 'REVISION' }[action], actorName: name, note,
        snapshot: ['SUBMIT', 'APPROVE'].includes(action) ? { summary: row.summary, narrative: row.narrative, constraints: row.constraints, nextPlan: row.nextPlan, incidentNote: row.incidentNote } : undefined,
      },
    });
    await logApproval(tx, user, { entityType: 'REPORT', entityId: reportId, step: action, decision: rule.to, note });
    await audit(tx, user, { action: action === 'APPROVE' ? 'APPROVE' : isReturn ? 'REJECT' : action === 'SUBMIT' ? 'SUBMIT' : 'UPDATE', module: 'reports', recordId: reportId, siteId: r.siteId, before: { status: r.status }, after: { status: rule.to, note } });
    const label = `${r.type.toLowerCase()} ${r.site.code} ${r.periodKey}`;
    const notifyMap = {
      SUBMIT: [['PJO', 'PM'], `Laporan ${label} menunggu pemeriksaan`],
      REVIEW: [['HO_HSE'], `Laporan ${label} menunggu pengesahan HO`],
      RETURN_REVIEW: [['HSE_SITE'], `Laporan ${label} perlu revisi (PJO/PM)`],
      RETURN_APPROVE: [['HSE_SITE'], `Laporan ${label} perlu revisi (HO)`],
      APPROVE: [['HSE_SITE', 'PJO', 'PM'], `Laporan ${label} disahkan HO`],
    };
    const [roles, title] = notifyMap[action];
    await notifyRoles(tx, roles, r.siteId, { type: 'APPROVAL', title, body: note ?? '', link: '/reports/' + reportId, severity: isReturn ? 'WARNING' : 'INFO', dedupeKey: `report-${reportId}-${action}-v${row.version}-${Date.now()}` });
    return { ok: true, status: rule.to };
  }, { timeout: 30000 });
}

export async function exportReport(user, reportId) {
  const r = await getReport(user, reportId);
  const s = r.summary;
  const wb = XLSX.utils.book_new();
  const identity = [
    ['LAPORAN HSE ' + r.type, ''], ['Site', `${s.identity.siteCode} — ${s.identity.siteName}`], ['Proyek', s.identity.projects.map((p) => p.name).join('; ')],
    ['Owner', s.identity.projects.map((p) => p.owner).join('; ')], ['Periode', `${s.period.start} s/d ${s.period.end}`],
    ['Penanggung jawab HSE', s.identity.responsibles.HSE_SITE ?? r.creatorName], ['Status', r.status], ['Versi', r.version], [],
    ['Manpower terdaftar', s.manpower.registered], ['Rata-rata manpower', s.manpower.average], ['Manhours', s.manhours], ['Safe manhours', s.safeManhours],
    ['LTIFR (draft)', s.ltifr], [], ['Ringkasan', r.narrative ?? ''], ['Kendala', r.constraints ?? ''], ['Rencana berikutnya', r.nextPlan ?? ''], [],
    ['Diperiksa PJO/PM', `${r.reviewerName ?? '-'} ${r.reviewedAt ? iso(r.reviewedAt) : ''}`], ['Disahkan HO', `${r.approverName ?? '-'} ${r.approvedAt ? iso(r.approvedAt) : ''}`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(identity), 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.activityDetail.map((a) => ({ Tanggal: a.date, Kegiatan: a.name, Keterangan: a.title, Jumlah: a.count, Peserta: a.participants }))), 'Aktivitas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.incidentDetail.map((i) => ({ Nomor: i.number, Tanggal: i.occurredAt.slice(0, 10), Kategori: i.category, Ringkasan: i.title, Status: i.status, 'Tindak lanjut': i.actions.map((a) => `${a.description} (PIC ${a.pic}${a.dueDate ? ', ' + iso(a.dueDate) : ''})`).join('; ') }))), 'Kejadian');
  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), name: `Laporan_HSE_${r.type}_${s.identity.siteCode}_${r.periodKey}.xlsx` };
}
