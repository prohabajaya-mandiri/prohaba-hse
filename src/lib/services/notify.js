import { ALL_SITE_ROLES } from '../access.js';

/** Penerima berdasarkan peran + cakupan site (peran lintas-site selalu menerima). */
export async function recipients(db, roles, siteId = null) {
  const users = await db.user.findMany({
    where: { isActive: true, role: { in: roles } },
    select: { id: true, role: true, region: true, sites: { select: { siteId: true } } },
  });
  if (!siteId) return users.map((u) => u.id);
  const site = await db.site.findUnique({ where: { id: siteId }, select: { region: true } });
  return users
    .filter((u) => ALL_SITE_ROLES.includes(u.role) || u.sites.some((s) => s.siteId === siteId) || (u.role === 'PM' && u.region && u.region === site?.region))
    .map((u) => u.id);
}

/** Buat notifikasi; dedupeKey mencegah pengingat ganda untuk kejadian yang sama. */
export async function notify(db, userIds, { type, title, body, link = null, severity = 'INFO', dedupeKey, dueDate = null }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  const res = await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type, title, body, link, severity, dedupeKey, dueDate })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function notifyRoles(db, roles, siteId, payload) {
  return notify(db, await recipients(db, roles, siteId), payload);
}

export async function logApproval(db, user, { entityType, entityId, step, decision, note = null }) {
  const { actorName } = await import('../audit.js');
  return db.approvalLog.create({ data: { entityType, entityId, step, decision, note, actorId: user.id, actorName: actorName(user) } });
}
