// Register tindakan korektif lapangan (CAPA). Sumber: Hazard Report, Inspeksi/P2H, audit, manual.
// Tindakan insiden & temuan CSMS tetap di modulnya, tetapi ikut ditampilkan di register sebagai rekap terbuka.
import { prisma } from '../prisma.js';
import { canSeeSite, siteFilter } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, iso, todayIn, tzLabel } from '../dates.js';
import { CAPA_SOURCES, CAPA_STATUSES, capaActions, capaTransition, DUE_DAYS, RISK_LEVELS } from '../domain/field-safety.js';
import { nextNumber } from '../sequence.js';
import { choice, ensure, id as idOf, InputError, object, optionalDate, text } from '../validation.js';
import { attachFiles, filesOf, requireSite } from './common.js';
import { notifyRoles } from './notify.js';

const ENTITY = 'CAPA';
const WORK_ROLES = ['HSE_SITE', 'HO_HSE', 'PJO', 'PM'];
const EDIT_ROLES = ['HSE_SITE', 'HO_HSE'];

const isLate = (r, tz) => r.status !== 'DITUTUP' && r.dueDate < todayIn(tz);

export async function listCapa(user, f = {}, { skip = 0, take = 50 } = {}) {
  const scope = siteFilter(user, f.siteId);
  const where = { ...scope };
  if (f.status === 'OPEN') where.status = { not: 'DITUTUP' };
  else if (CAPA_STATUSES.includes(f.status)) where.status = f.status;
  if (CAPA_SOURCES.includes(f.source)) where.sourceType = f.source;
  if (RISK_LEVELS.includes(f.risk)) where.riskLevel = f.risk;
  if (f.late === '1') Object.assign(where, { status: { not: 'DITUTUP' }, dueDate: { lt: todayIn() } });
  if (f.q) where.OR = ['number', 'title', 'picName', 'sourceRef'].map((k) => ({ [k]: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }));
  const since = addDays(todayIn(), -30);
  const [rows, total, open, late, waiting, closed30] = await Promise.all([
    prisma.correctiveAction.findMany({ where, skip, take, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], include: { site: { select: { code: true, timezone: true } } } }),
    prisma.correctiveAction.count({ where }),
    prisma.correctiveAction.count({ where: { ...scope, status: { not: 'DITUTUP' } } }),
    prisma.correctiveAction.count({ where: { ...scope, status: { not: 'DITUTUP' }, dueDate: { lt: todayIn() } } }),
    prisma.correctiveAction.count({ where: { ...scope, status: 'DIAJUKAN_TUTUP' } }),
    prisma.correctiveAction.count({ where: { ...scope, status: 'DITUTUP', closedAt: { gte: since } } }),
  ]);
  return {
    total, summary: { open, late, waiting, closed30 },
    rows: rows.map((r) => ({ ...r, late: isLate(r, r.site.timezone), tz: tzLabel(r.site.timezone), actions: capaActions(user.role, r.status, r.riskLevel) })),
  };
}

/** Tindakan terbuka di modul lain (insiden, temuan CSMS) agar HO melihat semua tunggakan di satu tempat. */
export async function otherOpenActions(user) {
  const scope = siteFilter(user, null);
  const [incident, csms] = await Promise.all([
    prisma.incidentAction.findMany({
      where: { status: 'OPEN', incident: scope }, orderBy: { dueDate: 'asc' }, take: 50,
      select: { id: true, description: true, pic: true, dueDate: true, incident: { select: { number: true, site: { select: { code: true } } } } },
    }),
    user.role === 'HRD' ? [] : prisma.csmsFinding.findMany({
      where: { ...scope, status: { not: 'DITUTUP' } }, orderBy: { dueDate: 'asc' }, take: 50,
      select: { id: true, number: true, description: true, picName: true, dueDate: true, status: true, site: { select: { code: true } } },
    }),
  ]);
  const now = todayIn();
  return [
    ...incident.map((a) => ({ key: 'inc-' + a.id, module: 'Insiden', ref: a.incident.number, site: a.incident.site.code, title: a.description, pic: a.pic, dueDate: a.dueDate, link: '/incidents?q=' + a.incident.number })),
    ...csms.map((x) => ({ key: 'csms-' + x.id, module: 'Temuan CSMS', ref: x.number, site: x.site.code, title: x.description, pic: x.picName, dueDate: x.dueDate, link: '/csms/findings/' + x.id })),
  ].map((r) => ({ ...r, late: Boolean(r.dueDate && r.dueDate < now) }))
    .sort((a, b) => (a.dueDate ? +a.dueDate : Infinity) - (b.dueDate ? +b.dueDate : Infinity));
}

export async function getCapa(user, id) {
  const r = await prisma.correctiveAction.findUnique({ where: { id }, include: { site: { select: { id: true, code: true, name: true, timezone: true } }, history: { orderBy: { createdAt: 'desc' } } } });
  ensure(r, 'Tindakan korektif tidak ditemukan.', 404);
  requireSite(user, r.siteId);
  return {
    ...r, files: await filesOf(ENTITY, [r.id]), late: isLate(r, r.site.timezone), tz: tzLabel(r.site.timezone),
    actions: capaActions(user.role, r.status, r.riskLevel),
    canEdit: EDIT_ROLES.includes(user.role) && r.status !== 'DITUTUP',
    canWork: WORK_ROLES.includes(user.role) && ['TERBUKA', 'DALAM_PROSES'].includes(r.status),
  };
}

/** Dipakai Hazard Report & Inspeksi di dalam transaksinya. Tenggat bawaan mengikuti tingkat risiko. */
export async function createCapaIn(tx, user, { siteId, sourceType, sourceId = null, sourceRef = null, title, description = null, riskLevel, picName, dueDate = null }) {
  const year = new Date().getUTCFullYear();
  const number = await nextNumber(tx, 'capa-' + year, `CA-${year}-`);
  const data = { siteId, sourceType, sourceId, sourceRef, title, description, riskLevel, picName, dueDate: dueDate ?? addDays(todayIn(), DUE_DAYS[riskLevel]), number, createdById: user.id, createdByName: actorName(user) };
  const row = await tx.correctiveAction.create({ data });
  await tx.correctiveActionHistory.create({ data: { actionId: row.id, action: 'CREATE', toStatus: 'TERBUKA', note: title.slice(0, 500), actorName: actorName(user) } });
  await audit(tx, user, { action: 'CREATE', module: 'actions', recordId: row.id, siteId, after: data, note: `Tindakan korektif ${number}` });
  return row;
}

function parseCapa(body) {
  const riskLevel = choice(body.riskLevel, RISK_LEVELS, 'Tingkat risiko');
  return {
    title: text(body.title, 'Judul tindakan', 200),
    description: text(body.description, 'Uraian', 3000, true),
    riskLevel,
    picName: text(body.picName, 'PIC', 150),
    dueDate: optionalDate(body.dueDate, 'Tenggat'),
  };
}

/** Tindakan manual / hasil audit. */
export async function createCapa(user, body) {
  object(body, ['siteId', 'sourceType', 'sourceRef', 'title', 'description', 'riskLevel', 'picName', 'dueDate']);
  ensure(EDIT_ROLES.includes(user.role), 'Tindakan korektif manual dibuat oleh HSE Site atau HO HSE.', 403);
  const siteId = requireSite(user, idOf(body.siteId, 'Site'));
  const v = parseCapa(body);
  const sourceType = choice(body.sourceType ?? 'MANUAL', ['MANUAL', 'AUDIT'], 'Sumber');
  const row = await prisma.$transaction((tx) => createCapaIn(tx, user, { ...v, siteId, sourceType, sourceRef: text(body.sourceRef, 'Referensi', 80, true) }), { timeout: 20000 });
  await notifyNew(row);
  return row;
}

export async function notifyNew(row) {
  await notifyRoles(prisma, ['HSE_SITE', 'PJO', ...(['TINGGI', 'EKSTREM'].includes(row.riskLevel) ? ['HO_HSE'] : [])], row.siteId, {
    type: 'CAPA', title: `Tindakan korektif ${row.number} (${row.riskLevel.toLowerCase()})`, body: `${row.title} — PIC ${row.picName}, tenggat ${iso(row.dueDate)}.`,
    link: `/actions/${row.id}`, severity: ['TINGGI', 'EKSTREM'].includes(row.riskLevel) ? 'DANGER' : 'WARNING', dedupeKey: `capa-${row.id}-new`, dueDate: row.dueDate,
  });
}

/** HSE Site/HO: ubah judul, PIC, tenggat, risiko. Pengerja (termasuk PJO/PM): isi tindakan yang dilakukan. */
export async function updateCapa(user, id, body) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.correctiveAction.findUnique({ where: { id } });
    ensure(before, 'Tindakan korektif tidak ditemukan.', 404);
    requireSite(user, before.siteId);
    let data;
    if (body.title !== undefined) {
      object(body, ['title', 'description', 'riskLevel', 'picName', 'dueDate', 'correctiveAction']);
      ensure(EDIT_ROLES.includes(user.role) && before.status !== 'DITUTUP', 'Anda tidak dapat mengubah tindakan ini.', 403);
      const v = parseCapa(body);
      data = { ...v, dueDate: v.dueDate ?? before.dueDate, correctiveAction: text(body.correctiveAction, 'Tindakan yang dilakukan', 3000, true) };
    } else {
      object(body, ['correctiveAction']);
      ensure(WORK_ROLES.includes(user.role) && ['TERBUKA', 'DALAM_PROSES'].includes(before.status), 'Tindakan hanya diisi sebelum diajukan untuk penutupan.', 409);
      data = { correctiveAction: text(body.correctiveAction, 'Tindakan yang dilakukan', 3000, true) };
    }
    const row = await tx.correctiveAction.update({ where: { id }, data });
    const d = diff(before, data);
    if (d.changed) {
      await tx.correctiveActionHistory.create({ data: { actionId: id, action: 'EDIT', fromStatus: before.status, toStatus: before.status, note: Object.keys(d.after).join(', '), actorName: actorName(user) } });
      await audit(tx, user, { action: 'UPDATE', module: 'actions', recordId: id, siteId: before.siteId, ...d, note: `Tindakan korektif ${before.number}` });
    }
    return row;
  }, { timeout: 20000 });
}

/** Sumber Hazard Report selesai bila semua tindakan korektifnya ditutup; dibuka lagi bila ada yang dibuka ulang. */
async function syncHazard(tx, capa, user) {
  if (capa.sourceType !== 'HAZARD' || !capa.sourceId) return;
  const openLeft = await tx.correctiveAction.count({ where: { sourceType: 'HAZARD', sourceId: capa.sourceId, status: { not: 'DITUTUP' } } });
  const hz = await tx.hazardReport.findUnique({ where: { id: capa.sourceId }, select: { status: true } });
  if (!hz) return;
  if (openLeft === 0 && hz.status !== 'SELESAI') await tx.hazardReport.update({ where: { id: capa.sourceId }, data: { status: 'SELESAI', closedAt: new Date(), closedBy: actorName(user), closedNote: `Semua tindakan korektif ditutup (${capa.number}).` } });
  if (openLeft > 0 && hz.status === 'SELESAI') await tx.hazardReport.update({ where: { id: capa.sourceId }, data: { status: 'TINDAK_LANJUT', closedAt: null, closedBy: null, closedNote: null } });
}

export async function capaTransitionAction(user, id, body) {
  object(body, ['action', 'note']);
  const action = choice(body.action, ['START', 'SUBMIT_CLOSE', 'RETURN', 'CLOSE', 'REOPEN'], 'Aksi');
  const note = text(body.note, 'Catatan', 2000, true);
  const result = await prisma.$transaction(async (tx) => {
    const c = await tx.correctiveAction.findUnique({ where: { id } });
    ensure(c, 'Tindakan korektif tidak ditemukan.', 404);
    requireSite(user, c.siteId);
    const rule = capaTransition(user.role, action, c.status, c.riskLevel);
    if (!rule) {
      const hint = ['CLOSE', 'RETURN'].includes(action) && ['TINGGI', 'EKSTREM'].includes(c.riskLevel) ? ' Risiko tinggi/ekstrem diverifikasi HO HSE.' : '';
      throw new InputError(`Aksi ini tidak tersedia untuk peran Anda pada status ${c.status}.${hint}`, 409);
    }
    if (rule.noteRequired) ensure(note, 'Alasan wajib diisi.');
    if (action === 'SUBMIT_CLOSE') {
      ensure(c.correctiveAction, 'Isi tindakan yang sudah dilakukan sebelum mengajukan penutupan.');
      ensure((await tx.fileObject.count({ where: { entityType: ENTITY, entityId: id } })) > 0, 'Unggah foto/bukti penyelesaian sebelum mengajukan penutupan.');
    }
    const data = { status: rule.to };
    if (action === 'CLOSE') Object.assign(data, { closedAt: new Date(), verifierName: actorName(user) });
    if (action === 'REOPEN') Object.assign(data, { closedAt: null, verifierName: null });
    const row = await tx.correctiveAction.update({ where: { id }, data });
    await tx.correctiveActionHistory.create({ data: { actionId: id, action, fromStatus: c.status, toStatus: rule.to, note, actorName: actorName(user) } });
    await audit(tx, user, { action: { CLOSE: 'APPROVE', RETURN: 'REJECT', REOPEN: 'REJECT', SUBMIT_CLOSE: 'SUBMIT' }[action] ?? 'UPDATE', module: 'actions', recordId: id, siteId: c.siteId, before: { status: c.status }, after: { status: rule.to }, note: `${c.number}: ${action}${note ? ' — ' + note : ''}` });
    if (['CLOSE', 'REOPEN'].includes(action)) await syncHazard(tx, row, user);
    return row;
  }, { timeout: 20000 });
  const base = { type: 'CAPA', link: `/actions/${id}`, dedupeKey: `capa-${id}-${action}-${Date.now()}` };
  if (action === 'SUBMIT_CLOSE') await notifyRoles(prisma, ['TINGGI', 'EKSTREM'].includes(result.riskLevel) ? ['HO_HSE'] : ['HSE_SITE'], result.siteId, { ...base, title: `${result.number} diajukan untuk ditutup`, body: 'Periksa bukti penyelesaian.' });
  if (['RETURN', 'REOPEN'].includes(action)) await notifyRoles(prisma, ['HSE_SITE', 'PJO'], result.siteId, { ...base, severity: 'WARNING', title: `${result.number} dikembalikan`, body: note });
  return result;
}

/** Foto/bukti penyelesaian. Unggahan tidak mengubah status. */
export async function uploadCapaFiles(user, id, files) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.correctiveAction.findUnique({ where: { id } });
    ensure(c, 'Tindakan korektif tidak ditemukan.', 404);
    requireSite(user, c.siteId);
    ensure(WORK_ROLES.includes(user.role), 'Anda tidak dapat mengunggah bukti.', 403);
    ensure(['TERBUKA', 'DALAM_PROSES'].includes(c.status), 'Bukti hanya ditambah sebelum diajukan untuk penutupan.', 409);
    const rows = await attachFiles(tx, user, files, { entityType: ENTITY, entityId: id, siteId: c.siteId, label: c.number });
    ensure(rows.length, 'Pilih file bukti.');
    await audit(tx, user, { action: 'UPDATE', module: 'actions', recordId: id, siteId: c.siteId, after: { files: rows.map((r) => r.fileName) }, note: `Bukti ${c.number}` });
    return { files: rows };
  }, { timeout: 30000 });
}

export const canReadCapaFile = (user, fileRow) => ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI'].includes(user.role) && canSeeSite(user, fileRow.siteId);

/** Pengingat H-1 dan terlambat (dipanggil runReminders). */
export async function capaReminders(push, now = todayIn()) {
  const rows = await prisma.correctiveAction.findMany({ where: { status: { in: ['TERBUKA', 'DALAM_PROSES'] }, dueDate: { lte: addDays(now, 1) } }, include: { site: { select: { timezone: true } } } });
  for (const c of rows) {
    const late = c.dueDate < todayIn(c.site.timezone);
    const high = ['TINGGI', 'EKSTREM'].includes(c.riskLevel);
    await push(late ? ['HSE_SITE', 'PJO', ...(high ? ['HO_HSE'] : [])] : ['HSE_SITE', 'PJO'], c.siteId, {
      type: 'CAPA', title: `${c.number} ${late ? 'lewat tenggat' : 'tenggat besok'}`, body: `${c.title} — PIC ${c.picName}, tenggat ${iso(c.dueDate)}.`,
      link: `/actions/${c.id}`, severity: late ? 'DANGER' : 'WARNING', dedupeKey: `capa-${c.id}-${iso(c.dueDate)}-${late ? 'late' : 'due'}`, dueDate: c.dueDate,
    });
  }
}
