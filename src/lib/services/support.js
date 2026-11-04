import { prisma } from '../prisma.js';
import { ROLE_LABELS } from '../access.js';
import { audit, actorName } from '../audit.js';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '../domain/support.js';
import { nextNumber } from '../sequence.js';
import { choice, ensure, object, optionalChoice, text } from '../validation.js';
import { attachFiles, filesOf, groupBy } from './common.js';
import { notify, notifyRoles } from './notify.js';

const MAX_FILES = 3;
const REPLIES = { replies: { orderBy: { createdAt: 'asc' } } };

async function withFiles(rows) {
  const files = groupBy(await filesOf('SUPPORT', rows.map((r) => r.id)), 'entityId');
  return rows.map((r) => ({ ...r, files: files[r.id] ?? [] }));
}

export async function createTicket(user, body, files) {
  object(body, ['category', 'message', 'page']);
  const data = {
    category: choice(body.category, SUPPORT_CATEGORIES, 'Kategori'),
    message: text(body.message, 'Pesan', 3000),
    page: text(body.page, 'Halaman', 200, true),
  };
  const uploads = (files ?? []).filter((f) => f?.size > 0);
  ensure(uploads.length <= MAX_FILES, `Maksimal ${MAX_FILES} gambar per aduan.`);
  return prisma.$transaction(async (tx) => {
    const sites = await tx.site.findMany({ where: { id: { in: user.siteIds ?? [] } }, select: { code: true } });
    const number = await nextNumber(tx, 'support', 'ADU-');
    const row = await tx.supportTicket.create({
      data: { ...data, number, createdById: user.id, createdByName: actorName(user), createdByRole: ROLE_LABELS[user.role] ?? user.role, siteCodes: sites.map((s) => s.code).join(', ') || null },
    });
    await attachFiles(tx, user, uploads, { entityType: 'SUPPORT', entityId: row.id, siteId: null, label: 'Lampiran aduan' });
    await notifyRoles(tx, ['HO_HSE'], null, { type: 'SUPPORT', title: `Aduan baru ${number}`, body: `${actorName(user)}: ${data.message.slice(0, 120)}`, link: '/help', severity: 'WARNING', dedupeKey: 'support-' + row.id });
    await audit(tx, user, { action: 'CREATE', module: 'support', recordId: row.id, after: { number, category: data.category } });
    return { id: row.id, number };
  }, { timeout: 30000 });
}

export async function myTickets(user) {
  return withFiles(await prisma.supportTicket.findMany({ where: { createdById: user.id }, include: REPLIES, orderBy: { createdAt: 'desc' }, take: 30 }));
}

export async function listTickets(f, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (SUPPORT_STATUSES.includes(f.status)) where.status = f.status;
  if (SUPPORT_CATEGORIES.includes(f.category)) where.category = f.category;
  const [rows, total, counts] = await Promise.all([
    prisma.supportTicket.findMany({ where, skip, take, include: REPLIES, orderBy: { createdAt: 'desc' } }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.groupBy({ by: ['status'], _count: true }),
  ]);
  return { rows: await withFiles(rows), total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
}

// Pelapor dan HO HSE saling membalas; pihak lain tidak dapat melihat aduan.
export async function replyTicket(user, ticketId, body) {
  object(body, ['message']);
  const message = text(body.message, 'Balasan', 3000);
  return prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    ensure(t, 'Aduan tidak ditemukan.', 404);
    const fromHo = user.role === 'HO_HSE';
    ensure(fromHo || t.createdById === user.id, 'Anda tidak memiliki akses ke aduan ini.', 403);
    const reply = await tx.supportReply.create({ data: { ticketId, authorId: user.id, authorName: actorName(user), fromHo, message } });
    if (fromHo && t.status === 'BARU') await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'DIPROSES' } });
    const payload = { type: 'SUPPORT', title: `Balasan aduan ${t.number}`, dedupeKey: 'support-reply-' + reply.id };
    if (t.createdById !== user.id) await notify(tx, [t.createdById], { ...payload, body: `${message.slice(0, 120)} (lihat tombol Aduan di kanan bawah)` });
    if (!fromHo) await notifyRoles(tx, ['HO_HSE'], null, { ...payload, body: `${actorName(user)}: ${message.slice(0, 120)}`, link: '/help' });
    return reply;
  });
}

export async function setTicketStatus(user, ticketId, body) {
  object(body, ['status']);
  ensure(user.role === 'HO_HSE', 'Status aduan diatur HO HSE.', 403);
  const status = optionalChoice(body.status, SUPPORT_STATUSES, 'Status');
  ensure(status, 'Status wajib diisi.');
  return prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    ensure(t, 'Aduan tidak ditemukan.', 404);
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status } });
    await notify(tx, [t.createdById], { type: 'SUPPORT', title: `Aduan ${t.number}: status diperbarui`, body: `Status aduan Anda sekarang ${status.toLowerCase()}.`, dedupeKey: `support-status-${ticketId}-${status}-${Date.now()}` });
    await audit(tx, user, { action: 'UPDATE', module: 'support', recordId: ticketId, before: { status: t.status }, after: { status } });
    return { ok: true };
  });
}

export async function canReadSupportFile(user, row) {
  return user.role === 'HO_HSE' || row.uploadedBy === user.id;
}
