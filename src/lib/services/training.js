import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays, addMonths, today } from '../dates.js';
import { getSetting } from '../settings.js';
import { array, bool, choice, date, ensure, id, InputError, int, object, optionalDate, optionalId, optionalNumber, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite, scopedPersonnel } from './common.js';

const MASTER_ROLES = ['HO_HSE', 'HRD'];
const assertMaster = (user) => {
  if (!MASTER_ROLES.includes(user.role)) throw new InputError('Master kompetensi diatur HO HSE / HRD.', 403);
};

export function certStatus(cert, now, threshold) {
  if (!cert) return 'MISSING';
  if (!cert.expiryDate) return 'VALID';
  if (new Date(cert.expiryDate) < now) return 'EXPIRED';
  if (new Date(cert.expiryDate) <= addDays(now, threshold)) return 'EXPIRING';
  return 'VALID';
}

export const listCompetencies = () =>
  prisma.competency.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { requirements: { orderBy: { position: 'asc' } }, _count: { select: { certificates: true } } } });

export async function saveCompetency(user, compId, body) {
  assertMaster(user);
  object(body, ['code', 'name', 'category', 'validityMonths', 'isActive', 'positions']);
  const data = {
    code: text(body.code, 'Kode', 30).toUpperCase(),
    name: text(body.name, 'Nama kompetensi', 150),
    category: text(body.category, 'Kategori', 60, true),
    validityMonths: body.validityMonths === '' || body.validityMonths == null ? null : int(body.validityMonths, 'Masa berlaku', 1, 240),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  const positions = Array.isArray(body.positions) ? [...new Set(body.positions.map((p) => text(p, 'Jabatan', 100)))] : null;
  return prisma.$transaction(async (tx) => {
    const before = compId ? await tx.competency.findUnique({ where: { id: compId } }) : null;
    const row = compId ? await tx.competency.update({ where: { id: compId }, data }) : await tx.competency.create({ data });
    if (positions) {
      await tx.positionRequirement.deleteMany({ where: { competencyId: row.id } });
      if (positions.length) await tx.positionRequirement.createMany({ data: positions.map((position) => ({ position, competencyId: row.id })) });
    }
    await audit(tx, user, { action: compId ? 'UPDATE' : 'CREATE', module: 'training', recordId: row.id, ...(before ? diff(before, data) : { after: data }), note: positions ? 'Jabatan wajib: ' + positions.join(', ') : null });
    return row;
  });
}

export async function listCertificates(user, f, { skip = 0, take = 50 } = {}) {
  const threshold = (await getSetting('reminder.thresholds')).certificate;
  const now = today();
  const where = { personnel: { ...siteFilter(user, f.siteId, 'currentSiteId') } };
  if (f.personnelId) where.personnelId = f.personnelId;
  if (f.competencyId) where.competencyId = f.competencyId;
  if (f.status === 'EXPIRED') where.expiryDate = { lt: now };
  if (f.status === 'EXPIRING') where.expiryDate = { gte: now, lte: addDays(now, threshold) };
  if (f.q) where.personnel.name = { contains: String(f.q).slice(0, 80), mode: 'insensitive' };
  const [rows, total] = await Promise.all([
    prisma.personnelCertificate.findMany({ where, skip, take, orderBy: [{ expiryDate: 'asc' }], include: { personnel: { select: { id: true, name: true, code: true, position: true, currentSite: { select: { code: true } } } }, competency: { select: { name: true, code: true } } } }),
    prisma.personnelCertificate.count({ where }),
  ]);
  const files = groupBy(await filesOf('CERTIFICATE', rows.map((r) => r.id)), 'entityId');
  return { threshold, total, rows: rows.map((r) => ({ ...r, status: certStatus(r, now, threshold), files: files[r.id] ?? [] })) };
}

export async function saveCertificate(user, certId, body, files) {
  object(body, ['personnelId', 'competencyId', 'certNumber', 'issuer', 'issueDate', 'expiryDate', 'notes']);
  const existing = certId ? await prisma.personnelCertificate.findUnique({ where: { id: certId } }) : null;
  ensure(!certId || existing, 'Sertifikat tidak ditemukan.', 404);
  const person = await scopedPersonnel(user, existing?.personnelId ?? id(body.personnelId, 'Personel'));
  const comp = await prisma.competency.findUnique({ where: { id: id(body.competencyId, 'Kompetensi') } });
  ensure(comp, 'Kompetensi tidak ditemukan.');
  const issueDate = optionalDate(body.issueDate, 'Tanggal terbit');
  const data = {
    competencyId: comp.id,
    certNumber: text(body.certNumber, 'No sertifikat', 80, true),
    issuer: text(body.issuer, 'Penerbit', 150, true),
    issueDate,
    expiryDate: optionalDate(body.expiryDate, 'Berlaku sampai') ?? (issueDate && comp.validityMonths ? addMonths(issueDate, comp.validityMonths) : null),
    notes: text(body.notes, 'Catatan', 500, true),
  };
  ensure(!data.issueDate || !data.expiryDate || data.expiryDate >= data.issueDate, 'Tanggal berakhir sebelum tanggal terbit.');
  return prisma.$transaction(async (tx) => {
    const row = certId
      ? await tx.personnelCertificate.update({ where: { id: certId }, data })
      : await tx.personnelCertificate.create({ data: { ...data, personnelId: person.id, createdBy: user.id } });
    await attachFiles(tx, user, files, { entityType: 'CERTIFICATE', entityId: row.id, siteId: person.currentSiteId });
    await audit(tx, user, { action: certId ? 'UPDATE' : 'CREATE', module: 'training', recordId: row.id, siteId: person.currentSiteId, ...(existing ? diff(existing, data) : { after: { person: person.code, ...data } }) });
    return row;
  }, { timeout: 20000 });
}

export async function listSessions(user, f, { skip = 0, take = 30 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  const [rows, total] = await Promise.all([
    prisma.trainingSession.findMany({
      where, skip, take, orderBy: { startDate: 'desc' },
      include: { site: { select: { code: true } }, competency: { select: { name: true, validityMonths: true } }, participants: { include: { personnel: { select: { id: true, name: true, code: true } } } } },
    }),
    prisma.trainingSession.count({ where }),
  ]);
  return { rows, total };
}

export async function saveSession(user, sessionId, body) {
  object(body, ['title', 'competencyId', 'siteId', 'startDate', 'endDate', 'trainer', 'location', 'status', 'notes', 'personnelIds']);
  const data = {
    title: text(body.title, 'Judul training', 200),
    competencyId: optionalId(body.competencyId, 'Kompetensi'),
    startDate: date(body.startDate, 'Mulai'),
    endDate: optionalDate(body.endDate, 'Selesai'),
    trainer: text(body.trainer, 'Trainer', 150, true),
    location: text(body.location, 'Lokasi', 200, true),
    status: choice(body.status ?? 'RENCANA', ['RENCANA', 'SELESAI', 'BATAL'], 'Status'),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(!data.endDate || data.endDate >= data.startDate, 'Tanggal selesai sebelum mulai.');
  return prisma.$transaction(async (tx) => {
    let row;
    if (sessionId) {
      const before = await tx.trainingSession.findUnique({ where: { id: sessionId } });
      ensure(before, 'Training tidak ditemukan.', 404);
      requireSite(user, before.siteId);
      row = await tx.trainingSession.update({ where: { id: sessionId }, data });
      await audit(tx, user, { action: 'UPDATE', module: 'training', recordId: row.id, siteId: row.siteId, ...diff(before, data) });
    } else {
      const siteId = requireSite(user, body.siteId);
      row = await tx.trainingSession.create({ data: { ...data, siteId, createdBy: user.id } });
      await audit(tx, user, { action: 'CREATE', module: 'training', recordId: row.id, siteId, after: data });
    }
    if (Array.isArray(body.personnelIds) && body.personnelIds.length) {
      const ids = array(body.personnelIds, 'Peserta', 300).map((x) => id(x));
      for (const personnelId of ids) await tx.trainingParticipant.upsert({ where: { sessionId_personnelId: { sessionId: row.id, personnelId } }, create: { sessionId: row.id, personnelId }, update: {} });
    }
    return row;
  });
}

/** Absensi & hasil. Peserta LULUS pada training berkompetensi dapat langsung diberi sertifikat. */
export async function recordResults(user, sessionId, body) {
  object(body, ['results', 'issueCertificates']);
  const s = await prisma.trainingSession.findUnique({ where: { id: sessionId }, include: { competency: true } });
  ensure(s, 'Training tidak ditemukan.', 404);
  requireSite(user, s.siteId);
  const results = array(body.results, 'Hasil', 300);
  return prisma.$transaction(async (tx) => {
    let issued = 0;
    for (const r of results) {
      object(r, ['participantId', 'attended', 'result', 'score']);
      const p = await tx.trainingParticipant.findFirst({ where: { id: id(r.participantId), sessionId } });
      ensure(p, 'Peserta tidak ditemukan.');
      const result = r.result ? choice(r.result, ['LULUS', 'TIDAK_LULUS'], 'Hasil') : null;
      await tx.trainingParticipant.update({ where: { id: p.id }, data: { attended: r.attended === null || r.attended === undefined ? null : bool(r.attended), result, score: optionalNumber(r.score, 'Nilai', 0, 1000) } });
      if (bool(body.issueCertificates) && result === 'LULUS' && s.competency && p.result !== 'LULUS') {
        const issueDate = s.endDate ?? s.startDate;
        await tx.personnelCertificate.create({
          data: { personnelId: p.personnelId, competencyId: s.competency.id, issuer: s.trainer, issueDate, expiryDate: s.competency.validityMonths ? addMonths(issueDate, s.competency.validityMonths) : null, notes: 'Dari training: ' + s.title, createdBy: user.id },
        });
        issued++;
      }
    }
    await audit(tx, user, { action: 'UPDATE', module: 'training', recordId: sessionId, siteId: s.siteId, note: `Hasil training dicatat (${results.length} peserta, ${issued} sertifikat)` });
    return { ok: true, issued };
  }, { timeout: 30000 });
}

/** Kebutuhan kompetensi menurut jabatan vs sertifikat berlaku. */
export async function competencyGaps(user, f) {
  const threshold = (await getSetting('reminder.thresholds')).certificate;
  const now = today();
  const reqs = await prisma.positionRequirement.findMany({ include: { competency: { select: { id: true, name: true, isActive: true } } } });
  const positions = [...new Set(reqs.map((r) => r.position))];
  if (!positions.length) return { rows: [], threshold };
  const people = await prisma.personnel.findMany({
    where: { isFormer: false, position: { in: positions }, ...siteFilter(user, f.siteId, 'currentSiteId') },
    select: { id: true, code: true, name: true, position: true, currentSite: { select: { code: true } }, certificates: { select: { competencyId: true, expiryDate: true } } },
    take: 2000, orderBy: { name: 'asc' },
  });
  const rows = [];
  for (const p of people) {
    for (const r of reqs.filter((x) => x.position === p.position && x.competency.isActive)) {
      const best = p.certificates.filter((c) => c.competencyId === r.competencyId).sort((a, b) => (b.expiryDate ?? 8.64e15) - (a.expiryDate ?? 8.64e15))[0];
      const status = certStatus(best, now, threshold);
      if (status !== 'VALID') rows.push({ key: p.id + r.competencyId, personnel: p, competency: r.competency.name, status, expiryDate: best?.expiryDate ?? null });
    }
  }
  return { rows, threshold };
}
