// Fit to Work: pengumpulan berkas P5M/Safety Talk + isian ringkas per pekerja agar yang tidak fit
// langsung tersaring. Tes alkohol (umumnya tahunan) dicatat per personel.
import { prisma } from '../prisma.js';
import { canSeeSite, siteFilter, siteScope } from '../access.js';
import { actorName, audit } from '../audit.js';
import { addDays, addMonths, iso, today } from '../dates.js';
import { ALCOHOL_INTERVAL_MONTHS, ALCOHOL_RESULTS, FIT_STATUSES, fitStatus, summarizeChecks } from '../domain/fit-to-work.js';
import { nextNumber } from '../sequence.js';
import { bool, choice, date, ensure, id as idOf, InputError, int, object, optionalId, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite, scopedPersonnel } from './common.js';
import { notifyRoles } from './notify.js';

const FIELD_ROLES = ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'];
const HSE_ROLES = ['HO_HSE', 'HSE_SITE'];

export const canReadFitFile = (user, fileRow) => [...FIELD_ROLES, 'DIREKSI'].includes(user.role) && canSeeSite(user, fileRow.siteId);

function dateRange(f, field) {
  const r = {};
  if (f.from) r.gte = date(f.from);
  if (f.to) r.lte = date(f.to);
  return Object.keys(r).length ? { [field]: r } : {};
}

// ─── Sesi P5M ───────────────────────────────────────────────────────────────

export async function listSessions(user, f = {}, { skip = 0, take = 30 } = {}) {
  const where = { ...siteFilter(user, f.siteId), ...dateRange(f, 'heldOn') };
  if (['PAGI', 'MALAM'].includes(f.shift)) where.shift = f.shift;
  if (f.q) where.OR = ['number', 'topic', 'presenter', 'location', 'department'].map((k) => ({ [k]: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }));
  if (f.flag === '1') where.AND = [{ OR: [{ stopCount: { gt: 0 } }, { watchCount: { gt: 0 } }] }];
  const [rows, total] = await Promise.all([
    prisma.fitSession.findMany({ where, skip, take, orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }], include: { site: { select: { code: true } }, checks: { orderBy: { name: 'asc' } } } }),
    prisma.fitSession.count({ where }),
  ]);
  const files = groupBy(await filesOf('FIT_SESSION', rows.map((r) => r.id)), 'entityId');
  return { total, rows: rows.map((r) => ({ ...r, files: files[r.id] ?? [] })) };
}

async function parseChecks(user, list) {
  ensure(Array.isArray(list) && list.length >= 1, 'Isi minimal satu peserta.');
  ensure(list.length <= 200, 'Maksimal 200 peserta per sesi.');
  const out = [];
  for (const [i, c] of list.entries()) {
    const n = i + 1;
    const personnelId = optionalId(c.personnelId, `Personel baris ${n}`);
    const person = personnelId ? await scopedPersonnel(user, personnelId, prisma, { name: true, position: true }) : null;
    const v = {
      personnelId,
      name: person?.name ?? text(c.name, `Nama baris ${n}`, 150),
      position: text(c.position, `Jabatan baris ${n}`, 120, true) || person?.position || null,
      healthy: c.healthy === undefined ? true : bool(c.healthy),
      medication: bool(c.medication),
      restToday: int(c.restToday, `Jam istirahat hari ini baris ${n}`, 0, 24),
      restYesterday: c.restYesterday === '' || c.restYesterday == null ? null : int(c.restYesterday, `Jam istirahat kemarin baris ${n}`, 0, 24),
      mentalReady: c.mentalReady === undefined ? true : bool(c.mentalReady),
      allowedByGl: c.allowedByGl === undefined ? true : bool(c.allowedByGl),
      note: text(c.note, `Keterangan baris ${n}`, 300, true),
    };
    const { status, reasons } = fitStatus(v);
    out.push({ ...v, status, reasons: reasons.join('; ') || null });
  }
  const ids = out.map((c) => c.personnelId).filter(Boolean);
  ensure(new Set(ids).size === ids.length, 'Personel yang sama tercatat dua kali dalam satu sesi.');
  return out;
}

const SESSION_FIELDS = ['siteId', 'heldOn', 'shift', 'topic', 'department', 'location', 'presenter', 'notes', 'checks'];

function parseSession(body) {
  const heldOn = date(body.heldOn, 'Tanggal');
  ensure(heldOn <= addDays(today(), 1), 'Tanggal P5M tidak boleh di masa depan.');
  return {
    heldOn,
    shift: choice(body.shift, ['PAGI', 'MALAM'], 'Shift'),
    topic: text(body.topic, 'Judul topik K3', 300),
    department: text(body.department, 'Departemen', 120, true),
    location: text(body.location, 'Lokasi', 200, true),
    presenter: text(body.presenter, 'Penyaji / GL', 150),
    notes: text(body.notes, 'Catatan', 2000, true),
  };
}

async function notifyStops(session, checks) {
  const stops = checks.filter((c) => c.status === 'TIDAK_BOLEH');
  if (!stops.length) return;
  await notifyRoles(prisma, ['HSE_SITE', 'PJO'], session.siteId, {
    type: 'FIT_TO_WORK', title: `${stops.length} pekerja tidak boleh bekerja — ${session.number}`,
    body: `${iso(session.heldOn)} shift ${session.shift.toLowerCase()}: ${stops.slice(0, 5).map((c) => `${c.name} (${c.reasons})`).join(', ')}${stops.length > 5 ? ', …' : ''}.`,
    link: '/fit-to-work?tab=screening', severity: 'DANGER', dedupeKey: `fit-${session.id}-${stops.length}`,
  });
}

export async function createSession(user, body, files) {
  object(body, SESSION_FIELDS);
  if (!FIELD_ROLES.includes(user.role)) throw new InputError('Anda tidak dapat mengisi P5M.', 403);
  const siteId = requireSite(user, idOf(body.siteId, 'Site'));
  const v = parseSession(body);
  const checks = await parseChecks(user, body.checks);
  const row = await prisma.$transaction(async (tx) => {
    const year = v.heldOn.getUTCFullYear();
    const number = await nextNumber(tx, 'p5m-' + year, `P5M-${year}-`);
    const created = await tx.fitSession.create({ data: { ...v, ...summarizeChecks(checks), number, siteId, createdBy: user.id, creatorName: actorName(user), checks: { create: checks } } });
    await attachFiles(tx, user, files, { entityType: 'FIT_SESSION', entityId: created.id, siteId, label: number });
    await audit(tx, user, { action: 'CREATE', module: 'fit-to-work', recordId: created.id, siteId, after: { number, ...v, ...summarizeChecks(checks) } });
    return created;
  }, { timeout: 30000 });
  await notifyStops(row, checks);
  return { id: row.id, number: row.number, ...summarizeChecks(checks) };
}

/** Koreksi isian (mis. salah ketik jam istirahat) oleh pembuat atau HSE dalam 3 hari; berkas boleh ditambah. */
export async function updateSession(user, id, body, files) {
  object(body, SESSION_FIELDS.filter((f) => f !== 'siteId'));
  const before = await prisma.fitSession.findUnique({ where: { id } });
  ensure(before, 'Sesi P5M tidak ditemukan.', 404);
  requireSite(user, before.siteId);
  ensure(HSE_ROLES.includes(user.role) || before.createdBy === user.id, 'Hanya pembuat atau HSE yang dapat mengubah sesi ini.', 403);
  ensure(user.role === 'HO_HSE' || before.createdAt >= addDays(new Date(), -3), 'Sesi lebih dari 3 hari hanya dapat dikoreksi HO HSE.', 409);
  const v = parseSession(body);
  const checks = await parseChecks(user, body.checks);
  const row = await prisma.$transaction(async (tx) => {
    await tx.fitCheck.deleteMany({ where: { sessionId: id } });
    const updated = await tx.fitSession.update({ where: { id }, data: { ...v, ...summarizeChecks(checks), checks: { create: checks } } });
    await attachFiles(tx, user, files, { entityType: 'FIT_SESSION', entityId: id, siteId: before.siteId, label: before.number });
    await audit(tx, user, { action: 'UPDATE', module: 'fit-to-work', recordId: id, siteId: before.siteId, before: { total: before.total, stopCount: before.stopCount, watchCount: before.watchCount }, after: { ...v, ...summarizeChecks(checks) }, note: `Koreksi ${before.number}` });
    return updated;
  }, { timeout: 30000 });
  await notifyStops(row, checks);
  return { id };
}

/** Daftar pekerja yang perlu perhatian (bawaan: hari ini, status selain AMAN). */
export async function screening(user, f = {}) {
  const from = f.from ? date(f.from) : today();
  const to = f.to ? date(f.to) : from;
  const status = FIT_STATUSES.includes(f.status) ? [f.status] : ['PENGAWASAN', 'TIDAK_BOLEH'];
  const rows = await prisma.fitCheck.findMany({
    where: { status: { in: status }, session: { ...siteFilter(user, f.siteId), heldOn: { gte: from, lte: to } } },
    include: { session: { select: { id: true, number: true, heldOn: true, shift: true, presenter: true, site: { select: { code: true } } } } },
    take: 500,
  });
  const rank = { TIDAK_BOLEH: 0, PENGAWASAN: 1, AMAN: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || +b.session.heldOn - +a.session.heldOn || a.name.localeCompare(b.name));
  const sessions = await prisma.fitSession.aggregate({
    where: { ...siteFilter(user, f.siteId), heldOn: { gte: from, lte: to } },
    _sum: { total: true, okCount: true, watchCount: true, stopCount: true }, _count: true,
  });
  return { from: iso(from), to: iso(to), rows, summary: { sessions: sessions._count, ...sessions._sum } };
}

// ─── Tes alkohol ────────────────────────────────────────────────────────────

export async function listAlcohol(user, f = {}, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId), ...dateRange(f, 'testedOn') };
  if (ALCOHOL_RESULTS.includes(f.result)) where.result = f.result;
  if (f.q) where.name = { contains: String(f.q).slice(0, 80), mode: 'insensitive' };
  const [rows, total] = await Promise.all([
    prisma.alcoholTest.findMany({ where, skip, take, orderBy: { testedOn: 'desc' }, include: { site: { select: { code: true } } } }),
    prisma.alcoholTest.count({ where }),
  ]);
  const files = groupBy(await filesOf('ALCOHOL_TEST', rows.map((r) => r.id)), 'entityId');
  return { total, rows: rows.map((r) => ({ ...r, files: files[r.id] ?? [] })) };
}

/** Personel aktif yang belum pernah tes alkohol atau tes terakhirnya lebih dari 12 bulan. */
export async function alcoholDue(user, f = {}) {
  const scope = siteScope(user);
  const where = { isFormer: false, ...(f.siteId ? { currentSiteId: scope === null || scope.includes(f.siteId) ? f.siteId : '__none__' } : scope === null ? {} : { currentSiteId: { in: scope } }) };
  const people = await prisma.personnel.findMany({ where, select: { id: true, name: true, position: true, currentSite: { select: { code: true } } }, orderBy: { name: 'asc' } });
  const last = await prisma.alcoholTest.groupBy({ by: ['personnelId'], where: { personnelId: { in: people.map((p) => p.id) } }, _max: { testedOn: true } });
  const lastBy = Object.fromEntries(last.map((l) => [l.personnelId, l._max.testedOn]));
  const limit = addMonths(today(), -ALCOHOL_INTERVAL_MONTHS);
  const due = people.filter((p) => !lastBy[p.id] || lastBy[p.id] < limit).map((p) => ({ ...p, lastTest: lastBy[p.id] ?? null }));
  return { total: people.length, dueCount: due.length, rows: due.slice(0, 300) };
}

export async function createAlcohol(user, body, files) {
  object(body, ['siteId', 'personnelId', 'name', 'testedOn', 'result', 'method', 'note']);
  if (!HSE_ROLES.includes(user.role)) throw new InputError('Tes alkohol dicatat oleh HSE Site atau HO HSE.', 403);
  const siteId = requireSite(user, idOf(body.siteId, 'Site'));
  const personnelId = optionalId(body.personnelId, 'Personel');
  const person = personnelId ? await scopedPersonnel(user, personnelId, prisma, { name: true }) : null;
  const v = {
    personnelId,
    name: person?.name ?? text(body.name, 'Nama', 150),
    testedOn: date(body.testedOn, 'Tanggal tes'),
    result: choice(body.result, ALCOHOL_RESULTS, 'Hasil'),
    method: text(body.method, 'Metode', 80, true),
    note: text(body.note, 'Catatan', 1000, true),
  };
  ensure(v.testedOn <= addDays(today(), 1), 'Tanggal tes tidak boleh di masa depan.');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.alcoholTest.create({ data: { ...v, siteId, createdBy: user.id, creatorName: actorName(user) } });
    await attachFiles(tx, user, files, { entityType: 'ALCOHOL_TEST', entityId: created.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'fit-to-work', recordId: created.id, siteId, after: v, note: 'Tes alkohol' });
    return created;
  }, { timeout: 20000 });
  if (v.result === 'POSITIF') {
    await notifyRoles(prisma, ['HO_HSE', 'HSE_SITE', 'PJO'], siteId, {
      type: 'FIT_TO_WORK', title: `Tes alkohol POSITIF — ${v.name}`, body: `Tanggal ${iso(v.testedOn)}. Tindak lanjuti sesuai prosedur.`,
      link: '/fit-to-work?tab=alcohol', severity: 'DANGER', dedupeKey: 'alcohol-' + row.id,
    });
  }
  return row;
}
