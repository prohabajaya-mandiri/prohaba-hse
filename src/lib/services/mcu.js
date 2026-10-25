import { prisma } from '../prisma.js';
import { canSeeSensitive, siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { decrypt, encrypt } from '../crypto.js';
import { addDays, today } from '../dates.js';
import { annualValidUntil, dueState, MCU_RESULTS, MCU_STAGES, MCU_TYPES, planMcu } from '../domain/mcu.js';
import { getSettings } from '../settings.js';
import { choice, ensure, id, object, optionalDate, optionalId, optionalNumber, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite, scopedPersonnel } from './common.js';

const FIELDS = ['personnelId', 'type', 'parentId', 'clinic', 'stage', 'screeningDate', 'mcuDate', 'resultDate', 'submitDate', 'feedbackDate', 'result', 'fuDueDate', 'validUntil', 'cost', 'notes', 'feedback'];

export async function mcuSettings() {
  const s = await getSettings(['mcu.durations', 'mcu.annualMonths', 'reminder.thresholds']);
  return { durations: s['mcu.durations'], annualMonths: s['mcu.annualMonths'], thresholds: s['reminder.thresholds'] };
}

function parse(body, existing, cfg) {
  object(body, FIELDS);
  const v = {
    type: choice(body.type ?? existing?.type, MCU_TYPES, 'Jenis MCU'),
    clinic: text(body.clinic ?? existing?.clinic, 'Klinik', 150),
    stage: choice(body.stage ?? existing?.stage ?? 'SCREENING', MCU_STAGES, 'Tahap'),
    screeningDate: optionalDate(body.screeningDate, 'Tanggal screening'),
    mcuDate: optionalDate(body.mcuDate, 'Tanggal MCU'),
    resultDate: optionalDate(body.resultDate, 'Tanggal hasil'),
    submitDate: optionalDate(body.submitDate, 'Tanggal submit'),
    feedbackDate: optionalDate(body.feedbackDate, 'Tanggal feedback'),
    result: choice(body.result ?? existing?.result ?? 'PENDING', MCU_RESULTS, 'Hasil'),
    fuDueDate: optionalDate(body.fuDueDate, 'Batas Follow Up'),
    validUntil: optionalDate(body.validUntil, 'Berlaku sampai'),
    cost: optionalNumber(body.cost, 'Biaya', 0, 1e10),
    feedback: text(body.feedback, 'Feedback', 2000, true),
  };
  ensure(!v.screeningDate || !v.mcuDate || v.mcuDate >= v.screeningDate, 'Tanggal MCU tidak boleh sebelum screening.');
  ensure(v.result === 'PENDING' || v.mcuDate, 'Tanggal MCU wajib diisi sebelum hasil ditetapkan.');
  // Jatuh tempo MCU annual mengikuti tanggal MCU; Follow Up mengikuti estimasi durasi FU.
  if (v.result === 'FIT' && !v.validUntil) v.validUntil = annualValidUntil(v.mcuDate, cfg.annualMonths);
  if (v.result === 'FOLLOW_UP' && !v.fuDueDate) v.fuDueDate = addDays(v.feedbackDate ?? v.resultDate ?? v.mcuDate, cfg.durations.followUp);
  if (['FIT', 'UNFIT'].includes(v.result)) v.fuDueDate = null;
  const notes = body.notes === undefined ? undefined : text(body.notes, 'Catatan medis', 2000, true);
  return { v, notes };
}

export async function listMcu(user, f, { skip = 0, take = 50 } = {}) {
  const now = today();
  const cfg = await mcuSettings();
  const where = { ...siteFilter(user, f.siteId) };
  if (f.result && MCU_RESULTS.includes(f.result)) where.result = f.result;
  if (f.stage && MCU_STAGES.includes(f.stage)) where.stage = f.stage;
  if (f.type && MCU_TYPES.includes(f.type)) where.type = f.type;
  if (f.personnelId) where.personnelId = f.personnelId;
  if (f.q) where.personnel = { name: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } };
  if (f.due === 'annual') Object.assign(where, { isLatest: true, result: 'FIT', validUntil: { lte: addDays(now, cfg.thresholds.mcuAnnual) } });
  if (f.due === 'fu') Object.assign(where, { isLatest: true, result: 'FOLLOW_UP', fuDueDate: { lte: addDays(now, cfg.thresholds.followUp) } });
  if (f.latest === '1') where.isLatest = true;
  const [rows, total] = await Promise.all([
    prisma.mcuRecord.findMany({
      where, skip, take, orderBy: [{ createdAt: 'desc' }],
      include: { personnel: { select: { id: true, code: true, name: true, position: true, category: true } }, site: { select: { code: true } } },
    }),
    prisma.mcuRecord.count({ where }),
  ]);
  const files = groupBy(await filesOf('MCU', rows.map((r) => r.id)), 'entityId');
  return {
    total,
    cfg,
    rows: rows.map(({ notesEnc, ...r }) => {
      const medical = canSeeSensitive(user, 'MEDICAL', r.siteId);
      return {
        ...r,
        notes: medical ? decrypt(notesEnc) : notesEnc ? '[dibatasi]' : null,
        files: medical ? files[r.id] ?? [] : [],
        canMedical: medical,
        annualDue: r.isLatest && r.result === 'FIT' ? dueState(r.validUntil, now, cfg.thresholds.mcuAnnual) : null,
        fuDue: r.isLatest && r.result === 'FOLLOW_UP' ? dueState(r.fuDueDate, now, cfg.thresholds.followUp) : null,
        plan: planMcu(r.screeningDate ?? r.mcuDate ?? r.createdAt, cfg.durations, r.result === 'FOLLOW_UP').plan,
      };
    }),
  };
}

export async function createMcu(user, body, files) {
  const person = await scopedPersonnel(user, id(body.personnelId, 'Personel'));
  const siteId = requireSite(user, person.currentSiteId);
  const cfg = await mcuSettings();
  const { v, notes } = parse(body, null, cfg);
  const parentId = optionalId(body.parentId, 'MCU asal');
  return prisma.$transaction(async (tx) => {
    if (parentId) {
      const parent = await tx.mcuRecord.findUnique({ where: { id: parentId } });
      ensure(parent?.personnelId === person.id, 'MCU asal tidak sesuai personel.');
    }
    // MCU baru menggantikan status kesehatan sebelumnya (pengingat hanya dari catatan terbaru).
    await tx.mcuRecord.updateMany({ where: { personnelId: person.id, isLatest: true }, data: { isLatest: false } });
    const row = await tx.mcuRecord.create({ data: { ...v, parentId, notesEnc: encrypt(notes), personnelId: person.id, siteId, createdBy: user.id, isLatest: true } });
    await attachFiles(tx, user, files, { entityType: 'MCU', entityId: row.id, siteId, sensitivity: 'MEDICAL' });
    // Status MCU/permit ikut umpan sinkronisasi ERP (/personnel/changes), yang berkursor updatedAt personel.
    await tx.personnel.update({ where: { id: person.id }, data: { updatedAt: new Date() } });
    await audit(tx, user, { action: 'CREATE', module: 'mcu', recordId: row.id, siteId, after: { person: person.code, ...v, notesEnc: notes ? 'x' : null } });
    return row;
  }, { timeout: 20000 });
}

export async function updateMcu(user, mcuId, body, files) {
  const existing = await prisma.mcuRecord.findUnique({ where: { id: mcuId } });
  ensure(existing, 'MCU tidak ditemukan.', 404);
  requireSite(user, existing.siteId);
  const cfg = await mcuSettings();
  delete body.personnelId;
  const { v, notes } = parse(body, existing, cfg);
  return prisma.$transaction(async (tx) => {
    const data = { ...v, ...(notes !== undefined && canSeeSensitive(user, 'MEDICAL', existing.siteId) ? { notesEnc: encrypt(notes) } : {}) };
    const row = await tx.mcuRecord.update({ where: { id: mcuId }, data });
    // Status MCU/permit ikut umpan sinkronisasi ERP (/personnel/changes), yang berkursor updatedAt personel.
    await tx.personnel.update({ where: { id: existing.personnelId }, data: { updatedAt: new Date() } });
    await attachFiles(tx, user, files, { entityType: 'MCU', entityId: row.id, siteId: existing.siteId, sensitivity: 'MEDICAL' });
    const d = diff(existing, data);
    // HSE Site dapat memperbarui MCU tanpa approval HO; seluruh perubahan wajib tercatat.
    if (d.changed || files?.length) await audit(tx, user, { action: 'UPDATE', module: 'mcu', recordId: mcuId, siteId: existing.siteId, ...d });
    return row;
  }, { timeout: 20000 });
}
