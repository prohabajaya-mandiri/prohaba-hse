import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays, today } from '../dates.js';
import { permitStatus, permitWarnings, suggestedEnd } from '../domain/permit.js';
import { getSettings } from '../settings.js';
import { bool, choice, date, ensure, id, InputError, object, optionalChoice, optionalId, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite, scopedPersonnel } from './common.js';

const FIELDS = ['personnelId', 'siteId', 'kind', 'permitType', 'number', 'issuer', 'startDate', 'endDate', 'basisResult', 'mcuId', 'isTemporary', 'notes', 'previousId', 'acknowledge'];

export async function permitSettings() {
  const s = await getSettings(['permit.defaults', 'permit.types', 'reminder.thresholds']);
  return { defaults: s['permit.defaults'], types: s['permit.types'], threshold: s['reminder.thresholds'].permit, fuThreshold: s['reminder.thresholds'].followUp };
}

export async function listPermits(user, f, { skip = 0, take = 50 } = {}) {
  const cfg = await permitSettings();
  const now = today();
  const where = { ...siteFilter(user, f.siteId) };
  if (f.kind) where.kind = choice(f.kind, ['PERMIT', 'SKS'], 'Jenis');
  if (f.personnelId) where.personnelId = f.personnelId;
  if (f.q) where.OR = [{ number: { contains: String(f.q).slice(0, 60), mode: 'insensitive' } }, { personnel: { name: { contains: String(f.q).slice(0, 60), mode: 'insensitive' } } }];
  // Filter status diterjemahkan ke rentang tanggal agar tetap berjalan di database.
  const soon = addDays(now, cfg.threshold);
  if (f.status === 'AKTIF') Object.assign(where, { revokedAt: null, startDate: { lte: now }, endDate: { gt: soon } });
  if (f.status === 'AKAN_HABIS') Object.assign(where, { revokedAt: null, endDate: { gte: now, lte: soon } });
  if (f.status === 'KEDALUWARSA') Object.assign(where, { revokedAt: null, endDate: { lt: now } });
  if (f.status === 'DICABUT') where.revokedAt = { not: null };
  const [rows, total] = await Promise.all([
    prisma.permit.findMany({
      where, skip, take, orderBy: [{ endDate: 'asc' }],
      include: { personnel: { select: { id: true, code: true, name: true, position: true } }, site: { select: { code: true } } },
    }),
    prisma.permit.count({ where }),
  ]);
  const files = groupBy(await filesOf('PERMIT', rows.map((r) => r.id)), 'entityId');
  const renewed = new Set((await prisma.permit.findMany({ where: { previousId: { in: rows.map((r) => r.id) } }, select: { previousId: true } })).map((r) => r.previousId));
  return {
    total, cfg,
    rows: rows.map((r) => ({ ...r, status: permitStatus(r, now, cfg.threshold), renewed: renewed.has(r.id), files: files[r.id] ?? [] })),
  };
}

/** Saran untuk form: hasil MCU terbaru & acuan masa berlaku (bukan penerbitan otomatis). */
export async function permitSuggestion(user, personnelId, startDate) {
  const person = await scopedPersonnel(user, id(personnelId, 'Personel'));
  const cfg = await permitSettings();
  const mcu = await prisma.mcuRecord.findFirst({ where: { personnelId: person.id, isLatest: true }, select: { id: true, result: true, mcuDate: true, validUntil: true, fuDueDate: true } });
  const start = startDate ? date(startDate) : today();
  return { mcu, suggestedEnd: mcu ? suggestedEnd(start, mcu.result, cfg.defaults) : null, siteId: person.currentSiteId };
}

async function parse(body) {
  object(body, FIELDS);
  const cfg = await permitSettings();
  const v = {
    kind: choice(body.kind, ['PERMIT', 'SKS'], 'Jenis'),
    permitType: text(body.permitType, 'Jenis permit', 100),
    number: text(body.number, 'Nomor', 80),
    issuer: text(body.issuer, 'Penerbit', 150, true),
    startDate: date(body.startDate, 'Tanggal mulai'),
    endDate: date(body.endDate, 'Tanggal akhir'),
    basisResult: optionalChoice(body.basisResult, ['FIT', 'FOLLOW_UP', 'UNFIT'], 'Hasil MCU acuan'),
    mcuId: optionalId(body.mcuId, 'MCU'),
    isTemporary: bool(body.isTemporary),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(v.endDate >= v.startDate, 'Tanggal akhir harus setelah tanggal mulai.');
  const warnings = permitWarnings(v, cfg.defaults);
  // Peringatan tidak memblokir (keputusan owner), tetapi wajib dikonfirmasi & tercatat.
  if (warnings.length && !bool(body.acknowledge)) {
    throw new InputError('Perlu konfirmasi: ' + warnings.join(' '), 422);
  }
  return { v, warnings };
}

export async function createPermit(user, body, files) {
  const person = await scopedPersonnel(user, id(body.personnelId, 'Personel'));
  const siteId = requireSite(user, body.siteId || person.currentSiteId);
  const { v, warnings } = await parse(body);
  const previousId = optionalId(body.previousId, 'Permit sebelumnya');
  return prisma.$transaction(async (tx) => {
    if (previousId) {
      const prev = await tx.permit.findUnique({ where: { id: previousId } });
      ensure(prev?.personnelId === person.id, 'Permit sebelumnya tidak sesuai personel.');
    }
    const row = await tx.permit.create({ data: { ...v, previousId, personnelId: person.id, siteId, createdBy: user.id } });
    await attachFiles(tx, user, files, { entityType: 'PERMIT', entityId: row.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'permits', recordId: row.id, siteId, after: { person: person.code, ...v }, note: warnings.length ? 'Dikonfirmasi dengan peringatan: ' + warnings.join(' ') : null });
    return row;
  }, { timeout: 20000 });
}

export async function updatePermit(user, permitId, body, files) {
  const existing = await prisma.permit.findUnique({ where: { id: permitId } });
  ensure(existing, 'Permit tidak ditemukan.', 404);
  requireSite(user, existing.siteId);
  delete body.personnelId;
  delete body.siteId;
  delete body.previousId;
  const { v, warnings } = await parse(body);
  return prisma.$transaction(async (tx) => {
    const row = await tx.permit.update({ where: { id: permitId }, data: v });
    await attachFiles(tx, user, files, { entityType: 'PERMIT', entityId: row.id, siteId: existing.siteId });
    await audit(tx, user, { action: 'UPDATE', module: 'permits', recordId: permitId, siteId: existing.siteId, ...diff(existing, v), note: warnings.join(' ') || null });
    return row;
  }, { timeout: 20000 });
}

export async function revokePermit(user, permitId, body) {
  object(body, ['reason']);
  const existing = await prisma.permit.findUnique({ where: { id: permitId } });
  ensure(existing && !existing.revokedAt, 'Permit tidak ditemukan atau sudah dicabut.', 404);
  requireSite(user, existing.siteId);
  const reason = text(body.reason, 'Alasan', 500);
  return prisma.$transaction(async (tx) => {
    await tx.permit.update({ where: { id: permitId }, data: { revokedAt: new Date(), revokeReason: reason } });
    await audit(tx, user, { action: 'UPDATE', module: 'permits', recordId: permitId, siteId: existing.siteId, before: { revokedAt: null }, after: { revokedAt: new Date(), reason } });
    return { ok: true };
  });
}
