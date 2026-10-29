// Register temuan & tindak lanjut CSMS. Temuan dari modul Insiden ditautkan (bukan disalin).
import { prisma } from '../prisma.js';
import { canAccess, canManageCsms, canSeeSite, findingActions, findingTransition, siteScope } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, iso, todayIn, tzLabel } from '../dates.js';
import { FINDING_SOURCES, FINDING_STATUSES, PIC_ROLES } from '../domain/csms.js';
import { nextNumber } from '../sequence.js';
import { choice, ensure, id as idOf, InputError, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { attachFiles, filesOf } from './common.js';
import { notifyRoles } from './notify.js';

const ENTITY = 'CSMS_FINDING';

function assertSite(user, siteId) {
  if (!canSeeSite(user, siteId) || user.role === 'HRD') throw new InputError('Temuan site ini di luar cakupan Anda.', 403);
}

export async function listFindings(user, f = {}, { skip = 0, take = 50 } = {}) {
  if (user.role === 'HRD') return { rows: [], total: 0, open: 0 };
  const scope = siteScope(user);
  const where = { ...(scope === null ? {} : { siteId: { in: scope } }) };
  if (f.siteId) where.siteId = scope === null || scope.includes(f.siteId) ? String(f.siteId) : '__none__';
  if (f.fstatus === 'OPEN') where.status = { not: 'DITUTUP' };
  else if (FINDING_STATUSES.includes(f.fstatus)) where.status = f.fstatus;
  if (FINDING_SOURCES.includes(f.fsource)) where.source = f.fsource;
  if (f.fq) where.OR = [{ number: { contains: String(f.fq).slice(0, 40), mode: 'insensitive' } }, { description: { contains: String(f.fq).slice(0, 80), mode: 'insensitive' } }];
  const [rows, total, open] = await Promise.all([
    prisma.csmsFinding.findMany({
      where, skip, take, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: { site: { select: { code: true, timezone: true } }, requirement: { select: { id: true, code: true, origin: true, item: { select: { sourceCode: true, refCode: true, internalCode: true } } } } },
    }),
    prisma.csmsFinding.count({ where }),
    prisma.csmsFinding.count({ where: { ...(scope === null ? {} : { siteId: { in: scope } }), status: { not: 'DITUTUP' } } }),
  ]);
  return {
    total, open,
    rows: rows.map((r) => {
      const now = todayIn(r.site.timezone);
      return { ...r, late: r.status !== 'DITUTUP' && r.dueDate && r.dueDate < now, tz: tzLabel(r.site.timezone), actions: findingActions(user.role, r.status) };
    }),
  };
}

export async function getFinding(user, id) {
  const r = await prisma.csmsFinding.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, code: true, name: true, timezone: true } },
      requirement: { include: { item: { select: { sourceCode: true, refCode: true, internalCode: true, sourceText: true, displayText: true } }, element: { select: { number: true, name: true } } } },
      history: { orderBy: { createdAt: 'desc' } },
    },
  });
  ensure(r, 'Temuan tidak ditemukan.', 404);
  assertSite(user, r.siteId);
  const [files, incident] = await Promise.all([
    filesOf(ENTITY, [r.id]),
    r.incidentId ? prisma.incident.findUnique({ where: { id: r.incidentId }, select: { id: true, number: true, title: true, status: true, actions: { where: r.incidentActionId ? { id: r.incidentActionId } : undefined, select: { id: true, description: true, pic: true, dueDate: true, status: true } } } }) : null,
  ]);
  const now = todayIn(r.site.timezone);
  return {
    ...r, files, incident, tz: tzLabel(r.site.timezone), late: r.status !== 'DITUTUP' && r.dueDate && r.dueDate < now,
    actions: findingActions(user.role, r.status),
    canEdit: canManageCsms(user),
    canWork: ['HSE_SITE', 'HO_HSE'].includes(user.role) && ['TERBUKA', 'DALAM_PROSES'].includes(r.status),
  };
}

function parseFinding(body) {
  return {
    source: choice(body.source, FINDING_SOURCES, 'Sumber temuan'),
    requirementId: optionalId(body.requirementId, 'Butir CSMS'),
    description: text(body.description, 'Uraian temuan', 3000),
    picRole: optionalChoice(body.picRole, PIC_ROLES, 'PIC'),
    picName: text(body.picName, 'Nama PIC', 150, true),
    dueDate: optionalDate(body.dueDate, 'Tenggat'),
    incidentId: optionalId(body.incidentId, 'Insiden'),
    incidentActionId: optionalId(body.incidentActionId, 'Tindakan insiden'),
  };
}
const FIELDS = ['siteId', 'source', 'requirementId', 'description', 'picRole', 'picName', 'dueDate', 'incidentId', 'incidentActionId'];

async function checkLinks(tx, siteId, v, findingId = null) {
  if (v.requirementId) {
    ensure(await tx.csmsRequirement.findFirst({ where: { id: v.requirementId, application: { siteId } } }), 'Butir CSMS bukan milik site ini.');
  }
  if (v.incidentId) {
    ensure(await tx.incident.findFirst({ where: { id: v.incidentId, siteId } }), 'Insiden bukan milik site ini.');
  } else ensure(!v.incidentActionId, 'Pilih insiden terlebih dahulu.');
  if (v.incidentActionId) {
    ensure(await tx.incidentAction.findFirst({ where: { id: v.incidentActionId, incidentId: v.incidentId } }), 'Tindakan bukan bagian insiden ini.');
    const dup = await tx.csmsFinding.findFirst({ where: { incidentActionId: v.incidentActionId, ...(findingId ? { id: { not: findingId } } : {}) } });
    ensure(!dup, `Tindakan insiden ini sudah tercatat sebagai temuan ${dup?.number}.`, 409);
  }
}

/** HO HSE dan HSE Site mencatat temuan (mis. hasil inspeksi); penutupan tetap oleh HO. */
export async function createFinding(user, body) {
  object(body, FIELDS);
  ensure(['HO_HSE', 'HSE_SITE'].includes(user.role), 'Anda tidak dapat mencatat temuan.', 403);
  const siteId = idOf(body.siteId, 'Site');
  assertSite(user, siteId);
  const v = parseFinding(body);
  const row = await prisma.$transaction(async (tx) => {
    await checkLinks(tx, siteId, v);
    const number = await nextNumber(tx, 'csms-finding-' + new Date().getUTCFullYear(), `TMN-${new Date().getUTCFullYear()}-`);
    const created = await tx.csmsFinding.create({ data: { ...v, siteId, number, createdById: user.id, createdByName: actorName(user) } });
    await tx.csmsFindingHistory.create({ data: { findingId: created.id, action: 'CREATE', toStatus: 'TERBUKA', note: v.description.slice(0, 500), actorName: actorName(user) } });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: created.id, siteId, after: { number, ...v }, note: 'Temuan CSMS' });
    return created;
  }, { timeout: 20000 });
  await notifyRoles(prisma, ['HSE_SITE', 'HO_HSE'], siteId, { type: 'CSMS', title: `Temuan CSMS baru ${row.number}`, body: row.description.slice(0, 200), link: `/csms/findings/${row.id}`, severity: 'WARNING', dedupeKey: `csms-finding-${row.id}-new` });
  return row;
}

/** HO: ubah uraian, PIC, tenggat, tautan. HSE Site/HO: isi tindakan perbaikan selama belum diajukan/ditutup. */
export async function updateFinding(user, id, body) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.csmsFinding.findUnique({ where: { id } });
    ensure(before, 'Temuan tidak ditemukan.', 404);
    assertSite(user, before.siteId);
    let data;
    if (canManageCsms(user) && body.description !== undefined) {
      object(body, [...FIELDS.filter((f) => f !== 'siteId'), 'correctiveAction']);
      data = { ...parseFinding(body), correctiveAction: text(body.correctiveAction, 'Tindakan perbaikan', 3000, true) };
      await checkLinks(tx, before.siteId, data, id);
    } else {
      object(body, ['correctiveAction']);
      ensure(['HSE_SITE', 'HO_HSE'].includes(user.role), 'Anda tidak dapat mengubah temuan.', 403);
      ensure(['TERBUKA', 'DALAM_PROSES'].includes(before.status), 'Tindakan perbaikan hanya diubah sebelum diajukan untuk penutupan.', 409);
      data = { correctiveAction: text(body.correctiveAction, 'Tindakan perbaikan', 3000, true) };
    }
    const row = await tx.csmsFinding.update({ where: { id }, data });
    const d = diff(before, data);
    if (d.changed) {
      await tx.csmsFindingHistory.create({ data: { findingId: id, action: 'EDIT', fromStatus: before.status, toStatus: before.status, note: Object.keys(d.after).join(', '), actorName: actorName(user) } });
      await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: id, siteId: before.siteId, ...d, note: `Temuan ${before.number}` });
    }
    return row;
  }, { timeout: 20000 });
}

export async function findingTransitionAction(user, id, body) {
  object(body, ['action', 'note']);
  const action = choice(body.action, ['START', 'SUBMIT_CLOSE', 'RETURN', 'CLOSE', 'REOPEN'], 'Aksi');
  const note = text(body.note, 'Catatan', 2000, true);
  const result = await prisma.$transaction(async (tx) => {
    const f = await tx.csmsFinding.findUnique({ where: { id } });
    ensure(f, 'Temuan tidak ditemukan.', 404);
    assertSite(user, f.siteId);
    const rule = findingTransition(user.role, action, f.status);
    if (!rule) throw new InputError(`Aksi ini tidak tersedia untuk peran Anda pada status ${f.status}.`, 409);
    if (rule.noteRequired) ensure(note, 'Alasan wajib diisi.');
    if (action === 'SUBMIT_CLOSE') {
      ensure(f.correctiveAction, 'Isi tindakan perbaikan sebelum mengajukan penutupan.');
      ensure((await tx.fileObject.count({ where: { entityType: ENTITY, entityId: id } })) > 0, 'Unggah bukti penyelesaian sebelum mengajukan penutupan.');
    }
    const data = { status: rule.to };
    if (action === 'CLOSE') Object.assign(data, { closedAt: new Date(), verifierName: actorName(user) });
    if (action === 'REOPEN') Object.assign(data, { closedAt: null });
    const row = await tx.csmsFinding.update({ where: { id }, data });
    await tx.csmsFindingHistory.create({ data: { findingId: id, action, fromStatus: f.status, toStatus: rule.to, note, actorName: actorName(user) } });
    await audit(tx, user, { action: { CLOSE: 'APPROVE', RETURN: 'REJECT', REOPEN: 'REJECT', SUBMIT_CLOSE: 'SUBMIT' }[action] ?? 'UPDATE', module: 'csms', recordId: id, siteId: f.siteId, before: { status: f.status }, after: { status: rule.to }, note: `Temuan ${f.number}: ${action}${note ? ' — ' + note : ''}` });
    return row;
  }, { timeout: 20000 });
  const base = { type: 'CSMS', link: `/csms/findings/${id}`, dedupeKey: `csms-finding-${id}-${action}-${Date.now()}` };
  if (action === 'SUBMIT_CLOSE') await notifyRoles(prisma, ['HO_HSE'], result.siteId, { ...base, title: `Temuan ${result.number} diajukan untuk ditutup`, body: 'Periksa bukti penyelesaian.' });
  if (['RETURN', 'REOPEN'].includes(action)) await notifyRoles(prisma, ['HSE_SITE'], result.siteId, { ...base, severity: 'WARNING', title: `Temuan ${result.number} dikembalikan`, body: note });
  if (action === 'CLOSE') await notifyRoles(prisma, ['HSE_SITE'], result.siteId, { ...base, title: `Temuan ${result.number} ditutup`, body: 'Ditutup setelah verifikasi HO.' });
  return result;
}

/** Bukti penyelesaian. Unggahan tidak mengubah status temuan. */
export async function uploadFindingFiles(user, id, files) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.csmsFinding.findUnique({ where: { id } });
    ensure(f, 'Temuan tidak ditemukan.', 404);
    assertSite(user, f.siteId);
    ensure(['HSE_SITE', 'HO_HSE'].includes(user.role), 'Anda tidak dapat mengunggah bukti temuan.', 403);
    ensure(['TERBUKA', 'DALAM_PROSES'].includes(f.status), 'Bukti hanya ditambah sebelum diajukan untuk penutupan.', 409);
    const rows = await attachFiles(tx, user, files, { entityType: ENTITY, entityId: id, siteId: f.siteId, label: f.number });
    ensure(rows.length, 'Pilih file bukti.');
    await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: id, siteId: f.siteId, after: { files: rows.map((r) => r.fileName) }, note: `Bukti temuan ${f.number}` });
    return { files: rows };
  }, { timeout: 30000 });
}

export function canReadFindingFile(user, fileRow) {
  return canAccess(user.role, '/csms') && user.role !== 'HRD' && canSeeSite(user, fileRow.siteId);
}

/** Pilihan insiden & tindakan site untuk ditautkan ke temuan. */
export async function incidentOptions(user, siteId) {
  const sid = idOf(siteId, 'Site');
  assertSite(user, sid);
  return prisma.incident.findMany({
    where: { siteId: sid }, orderBy: { occurredAt: 'desc' }, take: 50,
    select: { id: true, number: true, title: true, occurredAt: true, actions: { select: { id: true, description: true, status: true } } },
  });
}

/** Pengingat temuan mendekati/lewat tenggat (dipanggil runReminders). */
export async function findingReminders(push, cfg) {
  const rows = await prisma.csmsFinding.findMany({ where: { status: { not: 'DITUTUP' }, dueDate: { not: null } }, include: { site: { select: { timezone: true } } } });
  for (const f of rows) {
    const now = todayIn(f.site.timezone);
    if (f.dueDate > addDays(now, cfg.findingDueSoonDays) || f.dueDate < addDays(now, -cfg.lateWindowDays)) continue;
    const late = f.dueDate < now;
    await push(late ? ['HSE_SITE', 'HO_HSE'] : ['HSE_SITE'], f.siteId, {
      type: 'CSMS', title: `Temuan ${f.number} ${late ? 'terlambat' : 'mendekati tenggat'}`, body: `Tenggat ${iso(f.dueDate)} (${tzLabel(f.site.timezone)}). ${f.description.slice(0, 120)}`,
      link: `/csms/findings/${f.id}`, severity: late ? 'DANGER' : 'WARNING', dedupeKey: `csms-finding-${f.id}-${iso(f.dueDate)}-${late ? 'late' : 'due'}`, dueDate: f.dueDate,
    });
  }
}
