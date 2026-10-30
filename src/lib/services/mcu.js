import { prisma } from '../prisma.js';
import { canSeeSensitive, siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { decrypt, encrypt } from '../crypto.js';
import { addDays, today } from '../dates.js';
import { annualValidUntil, dueState, firstStage, MCU_RESULTS, MCU_STAGE_LABELS, MCU_STAGES, MCU_TYPES, nextStage, planMcu, reachedFields, stepFields } from '../domain/mcu.js';
import { getSettings } from '../settings.js';
import { choice, ensure, id, object, optionalDate, optionalId, optionalNumber, text } from '../validation.js';
import { attachFiles, filesOf, groupBy, requireSite, scopedPersonnel } from './common.js';

export async function mcuSettings() {
  const s = await getSettings(['mcu.durations', 'mcu.annualMonths', 'reminder.thresholds']);
  return { durations: s['mcu.durations'], annualMonths: s['mcu.annualMonths'], thresholds: s['reminder.thresholds'] };
}

const DATE_LABELS = { screeningDate: 'Tanggal screening', mcuDate: 'Tanggal MCU', resultDate: 'Tanggal hasil keluar', submitDate: 'Tanggal submit', feedbackDate: 'Tanggal feedback', fuDueDate: 'Batas Follow Up', validUntil: 'MCU annual berikutnya' };
const ORDER = ['screeningDate', 'mcuDate', 'resultDate', 'submitDate', 'feedbackDate'];

/** Urutan tanggal antar tahap wajib maju (screening ≤ MCU ≤ hasil ≤ submit ≤ feedback). */
function checkOrder(r) {
  const set = ORDER.filter((k) => r[k]);
  for (let i = 1; i < set.length; i++) {
    ensure(+new Date(r[set[i]]) >= +new Date(r[set[i - 1]]), `${DATE_LABELS[set[i]]} tidak boleh sebelum ${DATE_LABELS[set[i - 1]].toLowerCase()}.`);
  }
}

/** Isian tahap: hanya `keys` yang dibaca dari body. Hasil (FIT/FU/UNFIT) menentukan jatuh tempo otomatis. */
function parseStep(body, keys, merged, cfg, { required = [] } = {}) {
  const v = {};
  for (const k of keys) {
    if (k in DATE_LABELS) v[k] = optionalDate(body[k], DATE_LABELS[k]);
    else if (k === 'result') v.result = choice(body.result, ['FIT', 'FOLLOW_UP', 'UNFIT'], 'Hasil');
    else if (k === 'feedback') v.feedback = text(body.feedback, 'Feedback', 2000, true);
    else if (k === 'clinic') v.clinic = text(body.clinic, 'Klinik', 150);
    else if (k === 'cost') v.cost = optionalNumber(body.cost, 'Biaya', 0, 1e10);
  }
  for (const k of required) ensure(v[k], `${DATE_LABELS[k] ?? 'Hasil'} wajib diisi.`);
  const r = { ...merged, ...v };
  checkOrder(r);
  if (keys.includes('result')) {
    // Jatuh tempo MCU annual mengikuti tanggal MCU; Follow Up mengikuti estimasi durasi FU.
    if (r.result === 'FIT' && !v.validUntil) v.validUntil = annualValidUntil(r.mcuDate, cfg.annualMonths);
    if (r.result === 'FOLLOW_UP' && !v.fuDueDate) v.fuDueDate = addDays(r.resultDate ?? r.mcuDate, cfg.durations.followUp);
    if (r.result !== 'FIT') v.validUntil = null;
    if (r.result !== 'FOLLOW_UP') v.fuDueDate = null;
  }
  const notes = keys.includes('notes') && body.notes !== undefined ? text(body.notes, 'Catatan medis', 2000, true) : undefined;
  return { v, notes };
}

const notFuture = (d, label) => ensure(!d || d <= today(), `${label} tidak boleh setelah hari ini.`);

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
  // MCU baru selalu dimulai dari tahap pertama; tahap berikutnya lewat advanceMcu.
  object(body, ['personnelId', 'type', 'parentId', 'clinic', 'cost', 'screeningDate', 'mcuDate']);
  const type = choice(body.type, MCU_TYPES, 'Jenis MCU');
  const stage = firstStage(type);
  const dateKey = stage === 'SCREENING' ? 'screeningDate' : 'mcuDate';
  const { v } = parseStep(body, ['clinic', 'cost', dateKey], {}, cfg, { required: [dateKey] });
  if (dateKey === 'mcuDate') notFuture(v.mcuDate, 'Tanggal MCU');
  Object.assign(v, { type, stage, result: 'PENDING' });
  const parentId = optionalId(body.parentId, 'MCU asal');
  return prisma.$transaction(async (tx) => {
    if (parentId) {
      const parent = await tx.mcuRecord.findUnique({ where: { id: parentId } });
      ensure(parent?.personnelId === person.id, 'MCU asal tidak sesuai personel.');
    }
    // MCU baru menggantikan status kesehatan sebelumnya (pengingat hanya dari catatan terbaru).
    await tx.mcuRecord.updateMany({ where: { personnelId: person.id, isLatest: true }, data: { isLatest: false } });
    const row = await tx.mcuRecord.create({ data: { ...v, parentId, personnelId: person.id, siteId, createdBy: user.id, isLatest: true } });
    await attachFiles(tx, user, files, { entityType: 'MCU', entityId: row.id, siteId, sensitivity: 'MEDICAL' });
    // Status MCU/permit ikut umpan sinkronisasi ERP (/personnel/changes), yang berkursor updatedAt personel.
    await tx.personnel.update({ where: { id: person.id }, data: { updatedAt: new Date() } });
    await audit(tx, user, { action: 'CREATE', module: 'mcu', recordId: row.id, siteId, after: { person: person.code, ...v } });
    return row;
  }, { timeout: 20000 });
}

/** Maju satu tahap. Hanya isian tahap tujuan yang diterima; tanggal kejadian tidak boleh di masa depan. */
export async function advanceMcu(user, mcuId, body, files) {
  const existing = await prisma.mcuRecord.findUnique({ where: { id: mcuId } });
  ensure(existing, 'MCU tidak ditemukan.', 404);
  requireSite(user, existing.siteId);
  const to = nextStage(existing);
  ensure(to, 'MCU ini sudah selesai.', 409);
  ensure(body.stage === to, `Tahap berikutnya adalah ${MCU_STAGE_LABELS[to]}. Muat ulang halaman lalu coba lagi.`, 409);
  const keys = stepFields(existing.stage, to);
  object(body, ['stage', ...keys]);
  const cfg = await mcuSettings();
  const required = keys.filter((k) => ['mcuDate', 'resultDate', 'submitDate', 'feedbackDate', 'result'].includes(k));
  const { v, notes } = parseStep(body, keys, existing, cfg, { required });
  for (const k of ['mcuDate', 'resultDate', 'submitDate', 'feedbackDate']) if (v[k]) notFuture(v[k], DATE_LABELS[k]);
  return prisma.$transaction(async (tx) => {
    const data = { ...v, stage: to, ...(notes !== undefined && canSeeSensitive(user, 'MEDICAL', existing.siteId) ? { notesEnc: encrypt(notes) } : {}) };
    const row = await tx.mcuRecord.update({ where: { id: mcuId }, data });
    await tx.personnel.update({ where: { id: existing.personnelId }, data: { updatedAt: new Date() } });
    await attachFiles(tx, user, files, { entityType: 'MCU', entityId: row.id, siteId: existing.siteId, sensitivity: 'MEDICAL' });
    await audit(tx, user, { action: 'UPDATE', module: 'mcu', recordId: mcuId, siteId: existing.siteId, ...diff(existing, data), note: `Tahap ${MCU_STAGE_LABELS[existing.stage]} → ${MCU_STAGE_LABELS[to]}` });
    return row;
  }, { timeout: 20000 });
}

// Koreksi data tahap yang sudah dilalui. Tahap & jenis tidak bisa diubah di sini.
export async function updateMcu(user, mcuId, body, files) {
  const existing = await prisma.mcuRecord.findUnique({ where: { id: mcuId } });
  ensure(existing, 'MCU tidak ditemukan.', 404);
  requireSite(user, existing.siteId);
  const cfg = await mcuSettings();
  delete body.personnelId;
  const keys = reachedFields(existing.stage);
  object(body, keys);
  const required = keys.filter((k) => ['mcuDate', 'resultDate', 'submitDate', 'feedbackDate', 'result'].includes(k));
  if (existing.stage === 'SCREENING' || existing.screeningDate) required.push('screeningDate');
  const { v, notes } = parseStep(body, keys, existing, cfg, { required });
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
