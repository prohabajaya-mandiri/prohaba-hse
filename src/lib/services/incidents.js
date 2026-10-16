import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, iso, today } from '../dates.js';
import { nextNumber } from '../sequence.js';
import { getSettings } from '../settings.js';
import { bool, choice, date, ensure, int, object, optionalDate, optionalId, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite } from './common.js';
import { notifyRoles } from './notify.js';

export const INCIDENT_STATUSES = ['OPEN', 'INVESTIGASI', 'TINDAK_LANJUT', 'CLOSED'];

export async function incidentSettings() {
  const s = await getSettings(['incident.categories', 'incident.reportingDeadlines']);
  return { categories: s['incident.categories'], deadlines: s['incident.reportingDeadlines'] };
}

function occurredAt(body) {
  const d = date(body.date, 'Tanggal kejadian');
  const t = String(body.time ?? '00:00');
  ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(t), 'Jam harus HH:MM.');
  // Disimpan sebagai waktu lokal site pada tanggal tersebut (tanpa konversi zona).
  return new Date(iso(d) + 'T' + t + ':00Z');
}

function parseVictims(list) {
  if (!Array.isArray(list)) return [];
  ensure(list.length <= 50, 'Maksimal 50 korban.');
  return list.filter((v) => v && (v.name || v.personnelId)).map((v) => ({
    personnelId: optionalId(v.personnelId, 'Personel korban'),
    name: text(v.name, 'Nama korban', 150),
    injury: text(v.injury, 'Cedera', 300, true),
    bodyPart: text(v.bodyPart, 'Bagian tubuh', 100, true),
  }));
}

export async function listIncidents(user, f, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  if (f.category) where.category = String(f.category);
  if (f.status && INCIDENT_STATUSES.includes(f.status)) where.status = f.status;
  if (f.from) where.occurredAt = { ...(where.occurredAt ?? {}), gte: date(f.from) };
  if (f.to) where.occurredAt = { ...(where.occurredAt ?? {}), lt: addDays(date(f.to), 1) };
  if (f.q) where.OR = [{ title: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }, { number: { contains: String(f.q).slice(0, 40), mode: 'insensitive' } }];
  const [rows, total] = await Promise.all([
    prisma.incident.findMany({ where, skip, take, orderBy: { occurredAt: 'desc' }, include: { site: { select: { code: true } }, victims: true, actions: { orderBy: { dueDate: 'asc' } } } }),
    prisma.incident.count({ where }),
  ]);
  const files = groupBy(await filesOf('INCIDENT', rows.map((r) => r.id)), 'entityId');
  return { rows: rows.map((r) => ({ ...r, files: files[r.id] ?? [] })), total };
}

export async function createIncident(user, body, files) {
  object(body, ['siteId', 'date', 'time', 'location', 'category', 'title', 'chronology', 'impact', 'initialAction', 'lostDays', 'victims']);
  const siteId = requireSite(user, body.siteId);
  const cfg = await incidentSettings();
  const v = {
    occurredAt: occurredAt(body),
    location: text(body.location, 'Lokasi', 200),
    category: choice(body.category, cfg.categories, 'Kategori'),
    title: text(body.title, 'Judul', 200),
    chronology: text(body.chronology, 'Kronologi', 5000),
    impact: text(body.impact, 'Dampak', 2000, true),
    initialAction: text(body.initialAction, 'Penanganan awal', 2000, true),
    lostDays: int(body.lostDays ?? 0, 'Hari hilang', 0, 10000),
  };
  ensure(v.occurredAt <= addDays(today(), 1), 'Waktu kejadian tidak boleh di masa depan.');
  const victims = parseVictims(body.victims);
  return prisma.$transaction(async (tx) => {
    const year = v.occurredAt.getUTCFullYear();
    const number = await nextNumber(tx, 'incident-' + year, `INC-${year}-`);
    const row = await tx.incident.create({ data: { ...v, number, siteId, createdBy: user.id, creatorName: actorName(user), victims: { create: victims } } });
    await attachFiles(tx, user, files, { entityType: 'INCIDENT', entityId: row.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'incidents', recordId: row.id, siteId, after: { number, ...v, victims: victims.length } });
    const deadline = cfg.deadlines[v.category];
    await notifyRoles(tx, ['HO_HSE', 'PJO', 'PM', 'DIREKSI'], siteId, {
      type: 'INCIDENT', title: `Insiden ${labelCat(v.category)}: ${number}`,
      body: `${v.title} — ${v.location}.${deadline ? ` Tenggat lapor owner (draft): ${deadline} jam.` : ''}`,
      link: '/incidents?q=' + number, severity: ['LTI', 'FATALITY'].includes(v.category) ? 'DANGER' : 'WARNING', dedupeKey: 'incident-' + row.id,
    });
    return { id: row.id, number };
  }, { timeout: 20000 });
}

const labelCat = (c) => ({ NEAR_MISS: 'Near Miss', FAC: 'FAC', MTC: 'MTC', LTI: 'LTI', FATALITY: 'Fatality' })[c] ?? c;

export async function updateIncident(user, incidentId, body, files) {
  object(body, ['date', 'time', 'location', 'category', 'title', 'chronology', 'impact', 'initialAction', 'lostDays', 'victims', 'investigator', 'investigatedAt', 'immediateCause', 'rootCause', 'reportedToOwner', 'status']);
  const before = await prisma.incident.findUnique({ where: { id: incidentId }, include: { actions: true } });
  ensure(before, 'Insiden tidak ditemukan.', 404);
  requireSite(user, before.siteId);
  const cfg = await incidentSettings();
  const v = {
    occurredAt: occurredAt(body),
    location: text(body.location, 'Lokasi', 200),
    category: choice(body.category, cfg.categories, 'Kategori'),
    title: text(body.title, 'Judul', 200),
    chronology: text(body.chronology, 'Kronologi', 5000),
    impact: text(body.impact, 'Dampak', 2000, true),
    initialAction: text(body.initialAction, 'Penanganan awal', 2000, true),
    lostDays: int(body.lostDays ?? 0, 'Hari hilang', 0, 10000),
    investigator: text(body.investigator, 'Investigator', 150, true),
    investigatedAt: optionalDate(body.investigatedAt, 'Tanggal investigasi'),
    immediateCause: text(body.immediateCause, 'Penyebab langsung', 3000, true),
    rootCause: text(body.rootCause, 'Akar masalah', 3000, true),
    reportedToOwner: bool(body.reportedToOwner),
    status: choice(body.status ?? before.status, INCIDENT_STATUSES, 'Status'),
  };
  if (v.status === 'CLOSED') {
    ensure(v.rootCause, 'Akar masalah wajib diisi sebelum insiden ditutup.');
    ensure(before.actions.every((a) => a.status === 'DONE'), 'Semua tindakan korektif/pencegahan harus selesai sebelum ditutup.');
  }
  const victims = body.victims === undefined ? null : parseVictims(body.victims);
  return prisma.$transaction(async (tx) => {
    const row = await tx.incident.update({
      where: { id: incidentId },
      data: { ...v, ...(v.status === 'CLOSED' && before.status !== 'CLOSED' ? { closedAt: new Date(), closedBy: actorName(user) } : v.status !== 'CLOSED' ? { closedAt: null, closedBy: null } : {}) },
    });
    if (victims) {
      await tx.incidentVictim.deleteMany({ where: { incidentId } });
      if (victims.length) await tx.incidentVictim.createMany({ data: victims.map((x) => ({ ...x, incidentId })) });
    }
    await attachFiles(tx, user, files, { entityType: 'INCIDENT', entityId: incidentId, siteId: before.siteId });
    await audit(tx, user, { action: 'UPDATE', module: 'incidents', recordId: incidentId, siteId: before.siteId, ...diff(before, v) });
    return row;
  }, { timeout: 20000 });
}

export async function saveAction(user, incidentId, body) {
  object(body, ['id', 'type', 'description', 'pic', 'dueDate', 'status']);
  const inc = await prisma.incident.findUnique({ where: { id: incidentId } });
  ensure(inc, 'Insiden tidak ditemukan.', 404);
  requireSite(user, inc.siteId);
  ensure(inc.status !== 'CLOSED', 'Insiden sudah ditutup.', 409);
  const v = {
    type: choice(body.type, ['KOREKTIF', 'PENCEGAHAN'], 'Jenis tindakan'),
    description: text(body.description, 'Tindakan', 1000),
    pic: text(body.pic, 'Penanggung jawab', 150),
    dueDate: optionalDate(body.dueDate, 'Tenggat'),
    status: choice(body.status ?? 'OPEN', ['OPEN', 'DONE'], 'Status'),
  };
  return prisma.$transaction(async (tx) => {
    const data = { ...v, doneAt: v.status === 'DONE' ? new Date() : null };
    const row = body.id
      ? await tx.incidentAction.update({ where: { id: body.id, incidentId }, data })
      : await tx.incidentAction.create({ data: { ...data, incidentId } });
    if (inc.status === 'OPEN' || inc.status === 'INVESTIGASI') await tx.incident.update({ where: { id: incidentId }, data: { status: 'TINDAK_LANJUT' } });
    await audit(tx, user, { action: body.id ? 'UPDATE' : 'CREATE', module: 'incidents', recordId: incidentId, siteId: inc.siteId, after: v, note: 'Tindakan ' + v.type.toLowerCase() });
    return row;
  });
}

export async function exportIncidents(user, f) {
  const { rows } = await listIncidents(user, f, { skip: 0, take: 5000 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
    Nomor: r.number, Site: r.site.code, Waktu: r.occurredAt.toISOString().slice(0, 16).replace('T', ' '), Kategori: r.category, Judul: r.title, Lokasi: r.location,
    Korban: r.victims.map((v) => v.name).join(', '), 'Hari hilang': r.lostDays, Kronologi: r.chronology, 'Akar masalah': r.rootCause, Status: r.status,
    'Tindakan terbuka': r.actions.filter((a) => a.status !== 'DONE').length, 'Lapor owner': r.reportedToOwner ? 'Ya' : 'Belum',
  }))), 'Insiden');
  await audit(null, user, { action: 'EXPORT', module: 'incidents', note: `Export ${rows.length} insiden` });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
