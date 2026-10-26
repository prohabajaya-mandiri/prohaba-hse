import { prisma } from '../prisma.js';
import { siteScope } from '../access.js';
import { ensure, object } from '../validation.js';

export async function listNotifications(user, f = {}, { skip = 0, take = 50 } = {}) {
  const where = { userId: user.id, ...(f.unread === '1' ? { readAt: null } : {}), ...(f.type ? { type: String(f.type) } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }] }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { rows, total, unread };
}

export const unreadCount = async (user) => ({ unread: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) });

export async function markRead(user, body) {
  object(body, ['ids', 'all']);
  const where = { userId: user.id, readAt: null };
  if (!body.all) {
    ensure(Array.isArray(body.ids) && body.ids.length <= 500, 'Daftar notifikasi tidak valid.');
    where.id = { in: body.ids.filter((x) => typeof x === 'string') };
  }
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: r.count };
}

/** Item yang menunggu keputusan pengguna sesuai proses (bukan semua perubahan perlu persetujuan). */
export async function pendingApprovals(user) {
  const scope = siteScope(user);
  const siteIn = scope === null ? {} : { siteId: { in: scope } };
  const items = [];
  if (user.role === 'HO_HSE') {
    const [mutations, reports, indicators, settings] = await Promise.all([
      prisma.mutation.findMany({ where: { status: 'PENDING' }, include: { personnel: { select: { name: true, code: true } }, toSite: { select: { code: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.hseReport.findMany({ where: { status: 'REVIEWED' }, include: { site: { select: { code: true } } }, orderBy: { submittedAt: 'asc' } }),
      prisma.indicator.findMany({ where: { status: 'DRAFT', isActive: true } }),
      prisma.setting.findMany({ where: { status: 'DRAFT', key: { not: { startsWith: 'system.' } } } }),
    ]);
    mutations.forEach((m) => items.push({ kind: 'MUTATION', id: m.id, title: `Mutasi ${m.number}: ${m.personnel.name} → ${m.toSite.code}`, detail: `${m.requestedName} · efektif ${m.effectiveDate.toISOString().slice(0, 10)} · ${m.reason}`, link: '/placements', since: m.createdAt }));
    reports.forEach((r) => items.push({ kind: 'REPORT', id: r.id, title: `Sahkan laporan ${r.type.toLowerCase()} ${r.site.code} ${r.periodKey}`, detail: `Diperiksa ${r.reviewerName ?? '-'}`, link: '/reports/' + r.id, since: r.reviewedAt ?? r.submittedAt }));
    if (indicators.length) items.push({ kind: 'INDICATOR', id: 'indicators', title: `${indicators.length} indikator HSE berstatus draft`, detail: 'Formula/target perlu disetujui HO.', link: '/performance?tab=indicators', since: null });
    if (settings.length) items.push({ kind: 'SETTING', id: 'settings', title: `${settings.length} parameter berstatus draft`, detail: 'Parameter Bab 7 perlu persetujuan sebelum dijadikan aturan produksi.', link: '/settings', since: null });
  }
  if (['HO_HSE', 'HRD'].includes(user.role)) {
    const regs = await prisma.registration.findMany({ where: { status: 'MENUNGGU' }, include: { site: { select: { code: true } } }, orderBy: { createdAt: 'asc' } });
    regs.forEach((r) => items.push({ kind: 'REGISTRATION', id: r.id, title: `Pendaftaran ${r.number}: ${r.name} → ${r.site.code}`, detail: `${r.position} · tiba ${r.arrivalDate.toISOString().slice(0, 10)} · MCU ${r.mcuDate.toISOString().slice(0, 10)}`, link: '/registrations/' + r.id, since: r.createdAt }));
  }
  if (['PJO', 'PM'].includes(user.role)) {
    const reports = await prisma.hseReport.findMany({ where: { status: 'SUBMITTED', ...siteIn }, include: { site: { select: { code: true } } }, orderBy: { submittedAt: 'asc' } });
    reports.forEach((r) => items.push({ kind: 'REPORT', id: r.id, title: `Periksa laporan ${r.type.toLowerCase()} ${r.site.code} ${r.periodKey}`, detail: `Dikirim ${r.creatorName}`, link: '/reports/' + r.id, since: r.submittedAt }));
  }
  if (user.role === 'HSE_SITE') {
    const reports = await prisma.hseReport.findMany({ where: { status: 'REVISION', ...siteIn }, include: { site: { select: { code: true } } } });
    reports.forEach((r) => items.push({ kind: 'REPORT', id: r.id, title: `Revisi laporan ${r.type.toLowerCase()} ${r.site.code} ${r.periodKey}`, detail: r.approveNote ?? r.reviewNote ?? '', link: '/reports/' + r.id, since: r.updatedAt }));
  }
  const mine = await prisma.mutation.findMany({ where: { requestedBy: user.id, status: 'PENDING' }, include: { personnel: { select: { name: true } }, toSite: { select: { code: true } } } });
  mine.forEach((m) => items.push({ kind: 'MY_REQUEST', id: m.id, title: `Pengajuan Anda: mutasi ${m.number}`, detail: `${m.personnel.name} → ${m.toSite.code} menunggu HO`, link: '/placements', since: m.createdAt }));
  const history = await prisma.approvalLog.findMany({ where: ['HO_HSE', 'DIREKSI'].includes(user.role) ? {} : { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return { items, history };
}
