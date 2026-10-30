// Hazard Report (unsafe act / condition) dan Inspeksi & P2H. Temuan yang perlu perbaikan menjadi
// tindakan korektif (CAPA) di register yang sama, sehingga semua tunggakan terpantau di satu tempat.
import { prisma } from '../prisma.js';
import { canSeeSite, siteFilter } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, iso, today, todayIn } from '../dates.js';
import {
  ANSWERS, DUE_DAYS, HAZARD_CATEGORIES, HAZARD_STATUSES, HAZARD_TYPES, INSPECTION_KINDS, parseItemsText, RISK_LEVELS, riskLevel, summarizeAnswers,
} from '../domain/field-safety.js';
import { nextNumber } from '../sequence.js';
import { bool, choice, date, ensure, id as idOf, InputError, int, object, optionalChoice, optionalDate, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite } from './common.js';
import { createCapaIn, notifyNew } from './capa.js';
import { notifyRoles } from './notify.js';

const FIELD_ROLES = ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'];
const HIGH = ['TINGGI', 'EKSTREM'];

export const canReadFieldFile = (user, fileRow) => [...FIELD_ROLES, 'DIREKSI'].includes(user.role) && canSeeSite(user, fileRow.siteId);

function ensureFieldRole(user) {
  if (!FIELD_ROLES.includes(user.role)) throw new InputError('Anda tidak dapat mengubah data lapangan.', 403);
}

/** Tanggal + jam lokal site disimpan apa adanya (sama seperti Insiden). */
function localDateTime(body) {
  const d = date(body.date, 'Tanggal');
  const t = String(body.time ?? '00:00');
  ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(t), 'Jam harus HH:MM.');
  return new Date(iso(d) + 'T' + t + ':00Z');
}

const capasOf = async (sourceType, ids) => groupBy(await prisma.correctiveAction.findMany({
  where: { sourceType, sourceId: { in: ids } }, orderBy: { createdAt: 'asc' },
  select: { id: true, number: true, sourceId: true, title: true, picName: true, dueDate: true, status: true, riskLevel: true },
}), 'sourceId');

// ─── Hazard Report ──────────────────────────────────────────────────────────

export async function listHazards(user, f = {}, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  if (HAZARD_STATUSES.includes(f.status)) where.status = f.status;
  if (HAZARD_TYPES.includes(f.type)) where.type = f.type;
  if (RISK_LEVELS.includes(f.risk)) where.riskLevel = f.risk;
  if (HAZARD_CATEGORIES.includes(f.category)) where.category = f.category;
  if (f.from) where.observedAt = { ...(where.observedAt ?? {}), gte: date(f.from) };
  if (f.to) where.observedAt = { ...(where.observedAt ?? {}), lt: addDays(date(f.to), 1) };
  if (f.q) where.OR = ['number', 'location', 'description', 'reporterName'].map((k) => ({ [k]: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }));
  const scope = siteFilter(user, f.siteId);
  const [rows, total, open, high] = await Promise.all([
    prisma.hazardReport.findMany({ where, skip, take, orderBy: { observedAt: 'desc' }, include: { site: { select: { code: true } } } }),
    prisma.hazardReport.count({ where }),
    prisma.hazardReport.count({ where: { ...scope, status: { not: 'SELESAI' } } }),
    prisma.hazardReport.count({ where: { ...scope, status: { not: 'SELESAI' }, riskLevel: { in: HIGH } } }),
  ]);
  const ids = rows.map((r) => r.id);
  const [files, capas] = await Promise.all([filesOf('HAZARD', ids), capasOf('HAZARD', ids)]);
  const byFile = groupBy(files, 'entityId');
  const month = await prisma.hazardReport.count({ where: { ...scope, observedAt: { gte: addDays(today(), -30) } } });
  return { total, summary: { open, high, month }, rows: rows.map((r) => ({ ...r, files: byFile[r.id] ?? [], capas: capas[r.id] ?? [] })) };
}

/** Isian tindakan korektif dari form (dipakai saat lapor & saat tindak lanjut). */
function parseCapaInput(body, fallbackTitle, risk) {
  const riskLevelValue = optionalChoice(body.capaRisk, RISK_LEVELS, 'Risiko tindakan') ?? risk;
  return {
    title: text(body.capaTitle, 'Tindakan yang harus dilakukan', 200, true) || fallbackTitle.slice(0, 200),
    picName: text(body.picName, 'PIC', 150),
    dueDate: optionalDate(body.dueDate, 'Tenggat') ?? addDays(todayIn(), DUE_DAYS[riskLevelValue]),
    riskLevel: riskLevelValue,
  };
}

export async function createHazard(user, body, files) {
  object(body, ['siteId', 'date', 'time', 'location', 'type', 'category', 'description', 'immediateAction', 'likelihood', 'severity', 'reporterName', 'fixedOnSpot', 'capaTitle', 'picName', 'dueDate', 'capaRisk']);
  ensureFieldRole(user);
  const siteId = requireSite(user, idOf(body.siteId, 'Site'));
  const v = {
    observedAt: localDateTime(body),
    location: text(body.location, 'Lokasi', 200),
    type: choice(body.type, HAZARD_TYPES, 'Jenis temuan'),
    category: choice(body.category, HAZARD_CATEGORIES, 'Kategori'),
    description: text(body.description, 'Uraian bahaya', 3000),
    immediateAction: text(body.immediateAction, 'Tindakan segera', 2000, true),
    likelihood: int(body.likelihood, 'Kemungkinan', 1, 5),
    severity: int(body.severity, 'Keparahan', 1, 5),
    reporterName: text(body.reporterName, 'Nama pelapor', 150, true) || actorName(user),
  };
  ensure(v.observedAt <= addDays(today(), 1), 'Waktu temuan tidak boleh di masa depan.');
  v.riskLevel = riskLevel(v.likelihood, v.severity);
  const fixed = bool(body.fixedOnSpot);
  if (fixed) ensure(v.immediateAction, 'Isi tindakan segera yang dilakukan bila bahaya sudah diperbaiki di tempat.');
  const capaInput = !fixed && String(body.picName ?? '').trim() ? parseCapaInput(body, 'Perbaiki: ' + v.description, v.riskLevel) : null;
  const { row, capa } = await prisma.$transaction(async (tx) => {
    const year = v.observedAt.getUTCFullYear();
    const number = await nextNumber(tx, 'hazard-' + year, `HZ-${year}-`);
    const status = fixed ? 'SELESAI' : capaInput ? 'TINDAK_LANJUT' : 'BARU';
    const created = await tx.hazardReport.create({
      data: { ...v, number, siteId, status, createdBy: user.id, ...(fixed ? { closedAt: new Date(), closedBy: actorName(user), closedNote: 'Diperbaiki di tempat.' } : {}) },
    });
    await attachFiles(tx, user, files, { entityType: 'HAZARD', entityId: created.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'hazards', recordId: created.id, siteId, after: { number, ...v, status } });
    const ca = capaInput ? await createCapaIn(tx, user, { ...capaInput, siteId, sourceType: 'HAZARD', sourceId: created.id, sourceRef: number, description: v.description }) : null;
    return { row: created, capa: ca };
  }, { timeout: 30000 });
  if (!fixed) {
    await notifyRoles(prisma, ['HSE_SITE', ...(HIGH.includes(v.riskLevel) ? ['HO_HSE', 'PJO'] : [])], siteId, {
      type: 'HAZARD', title: `Hazard ${labelRisk(v.riskLevel)} ${row.number}`, body: `${v.description.slice(0, 160)} — ${v.location}.`,
      link: '/hazards?q=' + row.number, severity: HIGH.includes(v.riskLevel) ? 'DANGER' : 'WARNING', dedupeKey: 'hazard-' + row.id,
    });
  }
  if (capa) await notifyNew(capa);
  return { id: row.id, number: row.number, riskLevel: v.riskLevel, status: row.status };
}

const labelRisk = (r) => ({ RENDAH: 'risiko rendah', SEDANG: 'risiko sedang', TINGGI: 'risiko TINGGI', EKSTREM: 'risiko EKSTREM' })[r];

/** Tindak lanjut: buat tindakan korektif dari hazard (boleh lebih dari satu). */
export async function followUpHazard(user, id, body) {
  object(body, ['capaTitle', 'picName', 'dueDate', 'capaRisk']);
  ensureFieldRole(user);
  const hz = await prisma.hazardReport.findUnique({ where: { id } });
  ensure(hz, 'Hazard report tidak ditemukan.', 404);
  requireSite(user, hz.siteId);
  ensure(hz.status !== 'SELESAI', 'Hazard report sudah selesai.', 409);
  const input = parseCapaInput(body, 'Perbaiki: ' + hz.description, hz.riskLevel);
  const capa = await prisma.$transaction(async (tx) => {
    const ca = await createCapaIn(tx, user, { ...input, siteId: hz.siteId, sourceType: 'HAZARD', sourceId: hz.id, sourceRef: hz.number, description: hz.description });
    if (hz.status === 'BARU') await tx.hazardReport.update({ where: { id }, data: { status: 'TINDAK_LANJUT' } });
    return ca;
  }, { timeout: 20000 });
  await notifyNew(capa);
  return capa;
}

/** Tutup tanpa tindakan korektif (mis. sudah aman, duplikat). Hanya HSE Site/HO dan bila tak ada tindakan terbuka. */
export async function closeHazard(user, id, body) {
  object(body, ['note']);
  ensure(['HSE_SITE', 'HO_HSE'].includes(user.role), 'Penutupan hazard report oleh HSE Site atau HO HSE.', 403);
  const note = text(body.note, 'Alasan penutupan', 1000);
  return prisma.$transaction(async (tx) => {
    const hz = await tx.hazardReport.findUnique({ where: { id } });
    ensure(hz, 'Hazard report tidak ditemukan.', 404);
    requireSite(user, hz.siteId);
    ensure(hz.status !== 'SELESAI', 'Hazard report sudah selesai.', 409);
    const open = await tx.correctiveAction.count({ where: { sourceType: 'HAZARD', sourceId: id, status: { not: 'DITUTUP' } } });
    ensure(!open, 'Masih ada tindakan korektif terbuka; hazard selesai otomatis saat semuanya ditutup.', 409);
    const data = { status: 'SELESAI', closedAt: new Date(), closedBy: actorName(user), closedNote: note };
    const row = await tx.hazardReport.update({ where: { id }, data });
    await audit(tx, user, { action: 'UPDATE', module: 'hazards', recordId: id, siteId: hz.siteId, ...diff(hz, data), note: `Tutup ${hz.number}` });
    return row;
  });
}

// ─── Inspeksi & P2H ─────────────────────────────────────────────────────────

export const listTemplates = (all = false) => prisma.inspectionTemplate.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });

export async function saveTemplate(user, id, body) {
  object(body, ['code', 'name', 'kind', 'unitType', 'itemsText', 'isActive']);
  ensure(user.role === 'HO_HSE', 'Template checklist dikelola HO HSE.', 403);
  const items = parseItemsText(body.itemsText);
  ensure(items.length >= 1 && items.length <= 60, 'Isi 1–60 butir checklist (satu baris satu butir).');
  const v = {
    code: text(body.code, 'Kode', 30).toUpperCase(),
    name: text(body.name, 'Nama template', 120),
    kind: choice(body.kind, INSPECTION_KINDS, 'Jenis'),
    unitType: text(body.unitType, 'Jenis unit', 80, true),
    items,
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  ensure(/^[A-Z0-9-]+$/.test(v.code), 'Kode hanya huruf, angka dan tanda minus.');
  return prisma.$transaction(async (tx) => {
    const dup = await tx.inspectionTemplate.findUnique({ where: { code: v.code } });
    ensure(!dup || dup.id === id, `Kode ${v.code} sudah dipakai.`, 409);
    if (!id) {
      const row = await tx.inspectionTemplate.create({ data: v });
      await audit(tx, user, { action: 'CREATE', module: 'inspections', recordId: row.id, after: { ...v, items: items.length }, note: 'Template checklist' });
      return row;
    }
    const before = await tx.inspectionTemplate.findUnique({ where: { id } });
    ensure(before, 'Template tidak ditemukan.', 404);
    const row = await tx.inspectionTemplate.update({ where: { id }, data: v });
    await audit(tx, user, { action: 'UPDATE', module: 'inspections', recordId: id, ...diff(before, v), note: 'Template checklist (riwayat inspeksi lama tidak berubah)' });
    return row;
  });
}

export async function listInspections(user, f = {}, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  if (INSPECTION_KINDS.includes(f.kind)) where.kind = f.kind;
  if (['LAYAK', 'TIDAK_LAYAK'].includes(f.result)) where.result = f.result;
  if (f.from) where.inspectedOn = { ...(where.inspectedOn ?? {}), gte: date(f.from) };
  if (f.to) where.inspectedOn = { ...(where.inspectedOn ?? {}), lte: date(f.to) };
  if (f.q) where.OR = ['number', 'unitCode', 'location', 'inspectorName', 'templateName'].map((k) => ({ [k]: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }));
  const [rows, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip, take, orderBy: [{ inspectedOn: 'desc' }, { createdAt: 'desc' }], include: { site: { select: { code: true } } } }),
    prisma.inspection.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [files, capas] = await Promise.all([filesOf('INSPECTION', ids), capasOf('INSPECTION', ids)]);
  const byFile = groupBy(files, 'entityId');
  return { total, rows: rows.map((r) => ({ ...r, files: byFile[r.id] ?? [], capas: capas[r.id] ?? [] })) };
}

/** Status unit: P2H terakhir per unit dalam 7 hari. Unit TIDAK LAYAK tampil paling atas. */
export async function unitStatus(user, f = {}) {
  const rows = await prisma.inspection.findMany({
    where: { ...siteFilter(user, f.siteId), kind: 'P2H', unitCode: { not: null }, inspectedOn: { gte: addDays(today(), -7) } },
    orderBy: [{ inspectedOn: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, number: true, unitCode: true, unitType: true, inspectedOn: true, shift: true, result: true, notOkCount: true, inspectorName: true, site: { select: { code: true } } },
  });
  const seen = new Set();
  const latest = rows.filter((r) => (seen.has(r.unitCode) ? false : seen.add(r.unitCode)));
  const now = iso(today());
  return latest.map((r) => ({ ...r, today: iso(r.inspectedOn) === now })).sort((a, b) => (a.result === b.result ? 0 : a.result === 'TIDAK_LAYAK' ? -1 : 1));
}

export async function createInspection(user, body, files) {
  object(body, ['siteId', 'templateId', 'inspectedOn', 'shift', 'location', 'unitCode', 'unitType', 'hourMeter', 'inspectorName', 'answers', 'notes', 'picName']);
  ensureFieldRole(user);
  const siteId = requireSite(user, idOf(body.siteId, 'Site'));
  const tpl = await prisma.inspectionTemplate.findUnique({ where: { id: idOf(body.templateId, 'Template') } });
  ensure(tpl?.isActive, 'Template checklist tidak ditemukan atau nonaktif.', 404);
  const inspectedOn = date(body.inspectedOn, 'Tanggal inspeksi');
  ensure(inspectedOn <= addDays(today(), 1), 'Tanggal inspeksi tidak boleh di masa depan.');
  const isP2h = tpl.kind === 'P2H';
  const v = {
    inspectedOn,
    shift: optionalChoice(body.shift, ['PAGI', 'MALAM'], 'Shift'),
    // P2H cukup nomor unit; inspeksi area/APAR wajib lokasi.
    location: text(body.location, 'Lokasi', 200, isP2h),
    unitCode: isP2h ? text(body.unitCode, 'Kode / nomor lambung unit', 40).toUpperCase() : text(body.unitCode, 'Kode unit', 40, true),
    unitType: text(body.unitType, 'Jenis unit', 80, true) || tpl.unitType,
    hourMeter: body.hourMeter === '' || body.hourMeter == null ? null : int(body.hourMeter, 'Hour meter / KM', 0, 10_000_000),
    inspectorName: text(body.inspectorName, 'Pemeriksa', 150, true) || actorName(user),
    notes: text(body.notes, 'Catatan', 2000, true),
  };
  // Jawaban wajib lengkap untuk setiap butir template; butir TIDAK OK wajib diberi keterangan.
  const raw = Array.isArray(body.answers) ? body.answers : [];
  ensure(raw.length === tpl.items.length, 'Isi semua butir checklist.');
  const answers = tpl.items.map((item, i) => {
    const a = raw[i] ?? {};
    const result = choice(a.result, ANSWERS, `Butir ${i + 1}`);
    const note = text(a.note, `Keterangan butir ${i + 1}`, 500, true);
    if (result === 'TIDAK_OK') ensure(note, `Beri keterangan untuk butir "${item.text}" yang tidak OK.`);
    return { text: item.text, critical: Boolean(item.critical), result, note };
  });
  const sum = summarizeAnswers(answers);
  const picName = sum.failed.length ? text(body.picName, 'PIC perbaikan', 150) : null;
  const where = v.unitCode ?? v.location ?? tpl.name;
  const { row, capas } = await prisma.$transaction(async (tx) => {
    const year = inspectedOn.getUTCFullYear();
    const number = await nextNumber(tx, 'inspection-' + year, `INS-${year}-`);
    const created = await tx.inspection.create({
      data: { ...v, number, siteId, templateId: tpl.id, templateName: tpl.name, kind: tpl.kind, answers, okCount: sum.okCount, notOkCount: sum.notOkCount, result: sum.result, createdBy: user.id },
    });
    await attachFiles(tx, user, files, { entityType: 'INSPECTION', entityId: created.id, siteId });
    await audit(tx, user, { action: 'CREATE', module: 'inspections', recordId: created.id, siteId, after: { number, template: tpl.code, unit: v.unitCode, result: sum.result, notOk: sum.notOkCount } });
    // Setiap butir TIDAK OK menjadi satu tindakan korektif; butir kritis = risiko tinggi.
    const list = [];
    for (const a of sum.failed) {
      list.push(await createCapaIn(tx, user, {
        siteId, sourceType: 'INSPECTION', sourceId: created.id, sourceRef: number,
        title: `${where}: ${a.text}`.slice(0, 200), description: a.note, riskLevel: a.critical ? 'TINGGI' : 'SEDANG', picName,
      }));
    }
    return { row: created, capas: list };
  }, { timeout: 30000 });
  if (sum.result === 'TIDAK_LAYAK') {
    await notifyRoles(prisma, ['HSE_SITE', 'PJO', 'PM'], siteId, {
      type: 'INSPECTION', title: `${isP2h ? 'Unit' : 'Area'} ${where} TIDAK LAYAK`, body: `${tpl.name} ${row.number}: ${sum.failed.filter((a) => a.critical).map((a) => a.text).join('; ')}.${isP2h ? ' Unit tidak boleh dioperasikan sampai diperbaiki.' : ''}`,
      link: '/inspections?q=' + row.number, severity: 'DANGER', dedupeKey: 'inspection-' + row.id,
    });
  }
  for (const c of capas) await notifyNew(c);
  return { id: row.id, number: row.number, result: sum.result, capas: capas.length };
}
