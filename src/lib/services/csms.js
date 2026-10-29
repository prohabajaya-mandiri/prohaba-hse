import { prisma } from '../prisma.js';
import { canAccess, canManageCsms, canSeeSite, csmsActions, csmsTransition, siteScope } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { addDays, iso, monthRange, today, todayIso } from '../dates.js';
import {
  completeness, currentPeriodKey, derivedFlags, dueDateOf, EDITABLE, FREQUENCIES, maxScoreCheck, periodOf, PIC_ROLES,
  requiredPeriods, RESPONSIBILITIES, rollupStatus,
} from '../domain/csms.js';
import { getSetting } from '../settings.js';
import { bool, choice, date, ensure, id as idOf, InputError, int, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { attachFiles } from './common.js';
import { visibleDocumentWhere } from './documents.js';
import { logApproval, notifyRoles } from './notify.js';
import AMM_VIB1_008A from '../csms-templates/amm-vib1-008a.js';

const BUILTIN_TEMPLATES = { [AMM_VIB1_008A.code]: AMM_VIB1_008A };
const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
const EVIDENCE_SOURCE = 'CSMS_EVIDENCE';

function requireManager(user) {
  if (!canManageCsms(user)) throw new InputError('Standar CSMS hanya dikelola HO HSE.', 403);
}

// HRD membaca butir yang PIC-nya HRD saja; peran lain mengikuti cakupan site.
const requirementScope = (user) => (user.role === 'HRD' ? { picRole: 'HRD' } : {});

function assertSite(user, siteId) {
  if (!canSeeSite(user, siteId)) throw new InputError('Data CSMS site ini di luar cakupan Anda.', 403);
}

// ─── Template (lapis 1) ─────────────────────────────────────────────────────

export async function listTemplates() {
  const rows = await prisma.csmsTemplate.findMany({
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    include: { items: { select: { maxScore: true } }, _count: { select: { elements: true, applications: true } } },
  });
  return rows.map(({ items, ...t }) => ({ ...t, check: maxScoreCheck(items, t.sourceMaxScore) }));
}

export async function getTemplate(id) {
  const t = await prisma.csmsTemplate.findUnique({
    where: { id },
    include: {
      elements: { orderBy: { number: 'asc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } },
      _count: { select: { applications: true } },
    },
  });
  ensure(t, 'Template tidak ditemukan.', 404);
  return { ...t, check: maxScoreCheck(t.elements.flatMap((e) => e.items), t.sourceMaxScore) };
}

export const builtinTemplates = async () => {
  const existing = new Set((await prisma.csmsTemplate.findMany({ select: { code: true } })).map((t) => t.code));
  return Object.values(BUILTIN_TEMPLATES).map((t) => ({ code: t.code, name: t.name, ownerName: t.ownerName, loaded: existing.has(t.code) }));
};

/** Muat transkripsi dokumen sumber (status DRAFT; HO memeriksa sebelum mengaktifkan). */
export async function importBuiltinTemplate(user, code) {
  requireManager(user);
  const src = Object.hasOwn(BUILTIN_TEMPLATES, code) ? BUILTIN_TEMPLATES[code] : null;
  ensure(src, 'Template bawaan tidak dikenal.', 404);
  return prisma.$transaction(async (tx) => {
    ensure(!(await tx.csmsTemplate.findFirst({ where: { code: src.code } })), 'Template ini sudah dimuat. Salin template untuk membuat versi baru.', 409);
    const t = await tx.csmsTemplate.create({
      data: {
        code: src.code, version: 1, name: src.name, ownerName: src.ownerName, sourceDocCode: src.sourceDocCode, sourceDocName: src.sourceDocName,
        sourceRevision: src.sourceRevision, sourceMaxScore: src.sourceMaxScore, scoringGuide: src.scoringGuide, notes: src.notes,
        createdBy: user.id, createdByName: actorName(user),
      },
    });
    let order = 0;
    for (const el of src.elements) {
      const e = await tx.csmsElement.create({ data: { templateId: t.id, number: el.number, name: el.name, hoScope: el.hoScope, siteScope: el.siteScope } });
      await tx.csmsItem.createMany({
        data: el.items.map((i) => ({
          templateId: t.id, elementId: e.id, internalCode: i.id, sourceCode: i.sourceCode, refCode: i.refCode, subHeader: i.subHeader,
          sourceText: i.text, displayText: i.displayText ?? null, maxScore: i.maxScore, sourceRow: i.row, sortOrder: ++order,
        })),
      });
    }
    await audit(tx, user, { action: 'IMPORT', module: 'csms', recordId: t.id, after: { code: t.code, version: 1, source: src.sourceDocCode }, note: 'Muat template bawaan ' + src.code });
    return t;
  }, { timeout: 20000 });
}

function parseTemplate(body) {
  return {
    name: text(body.name, 'Nama template', 200),
    ownerName: text(body.ownerName, 'Owner', 150),
    sourceDocCode: text(body.sourceDocCode, 'Kode dokumen sumber', 80),
    sourceDocName: text(body.sourceDocName, 'Nama dokumen sumber', 250),
    sourceRevision: text(body.sourceRevision, 'Revisi sumber', 60, true),
    sourceEffective: optionalDate(body.sourceEffective, 'Tanggal berlaku sumber'),
    sourceMaxScore: body.sourceMaxScore === '' || body.sourceMaxScore == null ? null : int(body.sourceMaxScore, 'Nilai maksimum sumber', 0, 100000),
    scoringGuide: text(body.scoringGuide, 'Pedoman nilai', 2000, true),
    naPolicy: choice(body.naPolicy ?? 'EXCLUDE_FROM_MAX', ['EXCLUDE_FROM_MAX', 'SCORE_ZERO'], 'Perlakuan N/A'),
    notes: text(body.notes, 'Catatan', 2000, true),
  };
}

const TEMPLATE_FIELDS = ['name', 'ownerName', 'sourceDocCode', 'sourceDocName', 'sourceRevision', 'sourceEffective', 'sourceMaxScore', 'scoringGuide', 'naPolicy', 'notes'];

async function draftTemplate(db, templateId) {
  const t = await db.csmsTemplate.findUnique({ where: { id: templateId } });
  ensure(t, 'Template tidak ditemukan.', 404);
  ensure(t.status === 'DRAFT', 'Template aktif/pensiun tidak dapat diubah. Salin menjadi versi baru agar assessment historis tidak berubah.', 409);
  return t;
}

export async function updateTemplate(user, id, body) {
  requireManager(user);
  object(body, TEMPLATE_FIELDS);
  const v = parseTemplate(body);
  return prisma.$transaction(async (tx) => {
    const before = await draftTemplate(tx, id);
    const row = await tx.csmsTemplate.update({ where: { id }, data: v });
    await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: id, ...diff(before, v), note: 'Template ' + before.code });
    return row;
  }, { timeout: 20000 });
}

/** Salin template: kode sama → versi berikutnya; kode baru → template owner/site lain. */
export async function copyTemplate(user, id, body) {
  requireManager(user);
  object(body, ['code', 'name', 'ownerName']);
  const src = await getTemplate(id);
  const code = body.code ? text(body.code, 'Kode template', 40).toUpperCase() : src.code;
  ensure(/^[A-Z0-9-]+$/.test(code), 'Kode template hanya huruf, angka dan tanda minus.');
  return prisma.$transaction(async (tx) => {
    const last = await tx.csmsTemplate.findFirst({ where: { code }, orderBy: { version: 'desc' } });
    const t = await tx.csmsTemplate.create({
      data: {
        code, version: (last?.version ?? 0) + 1, status: 'DRAFT', copiedFromId: src.id,
        name: text(body.name ?? src.name, 'Nama template', 200), ownerName: text(body.ownerName ?? src.ownerName, 'Owner', 150),
        sourceDocCode: src.sourceDocCode, sourceDocName: src.sourceDocName, sourceRevision: src.sourceRevision, sourceEffective: src.sourceEffective,
        sourceMaxScore: src.sourceMaxScore, scoringGuide: src.scoringGuide, naPolicy: src.naPolicy, notes: src.notes,
        createdBy: user.id, createdByName: actorName(user),
      },
    });
    const itemMap = {};
    for (const el of src.elements) {
      const e = await tx.csmsElement.create({ data: { templateId: t.id, number: el.number, name: el.name, hoScope: el.hoScope, siteScope: el.siteScope } });
      for (const i of el.items) {
        const { id: oldId, templateId, elementId, ...rest } = i;
        void templateId; void elementId;
        itemMap[oldId] = (await tx.csmsItem.create({ data: { ...rest, templateId: t.id, elementId: e.id }, select: { id: true } })).id;
      }
    }
    // Tautan dokumen induk ikut disalin ke butir versi baru.
    const docLinks = await tx.hseDocumentCsmsItem.findMany({ where: { itemId: { in: Object.keys(itemMap) } } });
    if (docLinks.length) await tx.hseDocumentCsmsItem.createMany({ data: docLinks.map((l) => ({ documentId: l.documentId, itemId: itemMap[l.itemId] })), skipDuplicates: true });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: t.id, after: { code, version: t.version, copiedFrom: `${src.code} v${src.version}` }, note: 'Salin template' });
    return t;
  }, { timeout: 30000 });
}

export async function activateTemplate(user, id) {
  requireManager(user);
  return prisma.$transaction(async (tx) => {
    const t = await draftTemplate(tx, id);
    ensure((await tx.csmsItem.count({ where: { templateId: id } })) > 0, 'Template belum memiliki butir.');
    // Versi lama tetap dipakai penerapan yang sudah ada; hanya tidak dapat dipilih untuk penerapan baru.
    await tx.csmsTemplate.updateMany({ where: { code: t.code, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
    const row = await tx.csmsTemplate.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: new Date(), activatedByName: actorName(user) } });
    await audit(tx, user, { action: 'APPROVE', module: 'csms', recordId: id, before: { status: 'DRAFT' }, after: { status: 'ACTIVE' }, note: `Aktifkan template ${t.code} v${t.version}` });
    return row;
  }, { timeout: 20000 });
}

export async function deleteDraftTemplate(user, id) {
  requireManager(user);
  return prisma.$transaction(async (tx) => {
    const t = await draftTemplate(tx, id);
    ensure((await tx.csmsSiteApplication.count({ where: { templateId: id } })) === 0, 'Template sudah diterapkan ke site.', 409);
    await tx.csmsTemplate.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'csms', recordId: id, before: { code: t.code, version: t.version } });
    return { id };
  }, { timeout: 20000 });
}

export async function saveElement(user, templateId, elementId, body) {
  requireManager(user);
  object(body, ['number', 'name', 'hoScope', 'siteScope']);
  const v = {
    number: int(body.number, 'Nomor unsur', 1, 99),
    name: text(body.name, 'Nama unsur', 200),
    hoScope: text(body.hoScope, 'Tanggung jawab HO', 2000, true),
    siteScope: text(body.siteScope, 'Tanggung jawab Site', 2000, true),
  };
  return prisma.$transaction(async (tx) => {
    await draftTemplate(tx, templateId);
    const dup = await tx.csmsElement.findFirst({ where: { templateId, number: v.number, ...(elementId ? { id: { not: elementId } } : {}) } });
    ensure(!dup, `Unsur nomor ${v.number} sudah ada.`, 409);
    const row = elementId
      ? await tx.csmsElement.update({ where: { id: elementId, templateId }, data: v })
      : await tx.csmsElement.create({ data: { ...v, templateId } });
    await audit(tx, user, { action: elementId ? 'UPDATE' : 'CREATE', module: 'csms', recordId: row.id, after: v, note: 'Unsur template' });
    return row;
  }, { timeout: 20000 });
}

function parseItem(body) {
  return {
    internalCode: text(body.internalCode, 'ID internal', 20).toUpperCase(),
    sourceCode: text(body.sourceCode, 'Kode sumber', 20, true),
    refCode: text(body.refCode, 'Kode acuan', 20, true),
    subHeader: text(body.subHeader, 'Subjudul', 500, true),
    sourceText: text(body.sourceText, 'Teks persyaratan (kutipan sumber)', 3000),
    displayText: text(body.displayText, 'Teks tampilan', 3000, true),
    maxScore: int(body.maxScore ?? 2, 'Nilai maksimum', 0, 100),
    responsibility: choice(body.responsibility ?? 'BERSAMA', RESPONSIBILITIES, 'Penanggung jawab'),
    defaultFrequency: choice(body.defaultFrequency ?? 'ONCE', FREQUENCIES, 'Frekuensi'),
    evidenceGuide: text(body.evidenceGuide, 'Petunjuk bukti', 2000, true),
  };
}
const ITEM_FIELDS = ['elementId', 'internalCode', 'sourceCode', 'refCode', 'subHeader', 'sourceText', 'displayText', 'maxScore', 'responsibility', 'defaultFrequency', 'evidenceGuide'];

export async function saveItem(user, templateId, itemId, body) {
  requireManager(user);
  object(body, ITEM_FIELDS);
  const v = parseItem(body);
  const elementId = idOf(body.elementId, 'Unsur');
  return prisma.$transaction(async (tx) => {
    await draftTemplate(tx, templateId);
    ensure(await tx.csmsElement.findFirst({ where: { id: elementId, templateId } }), 'Unsur tidak ditemukan.', 404);
    const dup = await tx.csmsItem.findFirst({ where: { templateId, internalCode: v.internalCode, ...(itemId ? { id: { not: itemId } } : {}) } });
    ensure(!dup, `ID internal ${v.internalCode} sudah dipakai.`, 409);
    let row;
    if (itemId) {
      const before = await tx.csmsItem.findFirst({ where: { id: itemId, templateId } });
      ensure(before, 'Butir tidak ditemukan.', 404);
      row = await tx.csmsItem.update({ where: { id: itemId }, data: { ...v, elementId } });
      await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: itemId, ...diff(before, v), note: 'Butir template' });
    } else {
      const last = await tx.csmsItem.findFirst({ where: { templateId }, orderBy: { sortOrder: 'desc' } });
      row = await tx.csmsItem.create({ data: { ...v, templateId, elementId, sortOrder: (last?.sortOrder ?? 0) + 1 } });
      await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: row.id, after: v, note: 'Butir template' });
    }
    return row;
  }, { timeout: 20000 });
}

export async function deleteItem(user, templateId, itemId) {
  requireManager(user);
  return prisma.$transaction(async (tx) => {
    await draftTemplate(tx, templateId);
    const before = await tx.csmsItem.findFirst({ where: { id: itemId, templateId } });
    ensure(before, 'Butir tidak ditemukan.', 404);
    await tx.csmsItem.delete({ where: { id: itemId } });
    await audit(tx, user, { action: 'DELETE', module: 'csms', recordId: itemId, before });
    return { id: itemId };
  }, { timeout: 20000 });
}

// ─── Penerapan per site (lapis 2) ───────────────────────────────────────────

export async function listApplications(user, { siteId, status } = {}) {
  const scope = siteScope(user);
  const where = {
    ...(scope === null ? {} : { siteId: { in: scope } }),
    ...(siteId ? { siteId } : {}),
    ...(status === 'all' ? {} : { status: status === 'ENDED' ? 'ENDED' : 'ACTIVE' }),
  };
  const rows = await prisma.csmsSiteApplication.findMany({
    where,
    include: { site: { select: { id: true, code: true, name: true } }, template: { select: { id: true, code: true, version: true, name: true, ownerName: true, status: true } } },
    orderBy: [{ site: { name: 'asc' } }, { startDate: 'desc' }],
  });
  const projectIds = rows.map((r) => r.projectId).filter(Boolean);
  const projects = Object.fromEntries((await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, owner: true } })).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, project: projects[r.projectId] ?? null, label: `${r.site.code} · ${r.template.code} v${r.template.version}` }));
}

const defaultPic = (responsibility) => (responsibility === 'HO' ? 'HO_HSE' : 'HSE_SITE');

function parseApplication(body, { creating }) {
  return {
    ...(creating ? { siteId: idOf(body.siteId, 'Site'), templateId: idOf(body.templateId, 'Template') } : {}),
    projectId: optionalId(body.projectId, 'Proyek'),
    ownerRegisterNo: text(body.ownerRegisterNo, 'Nomor register CMS', 80, true),
    requireReview: bool(body.requireReview),
    startDate: date(body.startDate, 'Tanggal mulai'),
    endDate: optionalDate(body.endDate, 'Tanggal selesai'),
    notes: text(body.notes, 'Catatan', 2000, true),
    ...(creating ? {} : { status: choice(body.status ?? 'ACTIVE', ['ACTIVE', 'ENDED'], 'Status') }),
  };
}

export async function createApplication(user, body) {
  requireManager(user);
  object(body, ['siteId', 'templateId', 'projectId', 'ownerRegisterNo', 'requireReview', 'startDate', 'endDate', 'notes']);
  const v = parseApplication(body, { creating: true });
  ensure(!v.endDate || v.endDate >= v.startDate, 'Tanggal selesai sebelum tanggal mulai.');
  return prisma.$transaction(async (tx) => {
    const [site, template] = await Promise.all([
      tx.site.findUnique({ where: { id: v.siteId } }),
      tx.csmsTemplate.findUnique({ where: { id: v.templateId }, include: { items: true } }),
    ]);
    ensure(site, 'Site tidak ditemukan.', 404);
    ensure(template?.status === 'ACTIVE', 'Hanya template berstatus Aktif yang dapat diterapkan.', 409);
    if (v.projectId) ensure(await tx.project.findFirst({ where: { id: v.projectId, siteId: v.siteId } }), 'Proyek bukan milik site ini.');
    const dup = await tx.csmsSiteApplication.findFirst({ where: { siteId: v.siteId, templateId: v.templateId, status: 'ACTIVE' } });
    ensure(!dup, 'Template ini sudah diterapkan aktif di site tersebut.', 409);
    const app = await tx.csmsSiteApplication.create({ data: { ...v, createdBy: user.id, createdByName: actorName(user) } });
    // Persyaratan disalin dari template; penyesuaian site disimpan terpisah tanpa mengubah teks owner.
    await tx.csmsRequirement.createMany({
      data: template.items.map((i) => ({
        applicationId: app.id, itemId: i.id, elementId: i.elementId, responsibility: i.responsibility, frequency: i.defaultFrequency, picRole: defaultPic(i.responsibility),
      })),
    });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: app.id, siteId: v.siteId, after: { ...v, template: `${template.code} v${template.version}`, requirements: template.items.length }, note: 'Terapkan template ke site' });
    return app;
  }, { timeout: 20000 });
}

export async function updateApplication(user, id, body) {
  requireManager(user);
  object(body, ['projectId', 'ownerRegisterNo', 'requireReview', 'startDate', 'endDate', 'notes', 'status']);
  const v = parseApplication(body, { creating: false });
  return prisma.$transaction(async (tx) => {
    const before = await tx.csmsSiteApplication.findUnique({ where: { id } });
    ensure(before, 'Penerapan tidak ditemukan.', 404);
    if (v.projectId) ensure(await tx.project.findFirst({ where: { id: v.projectId, siteId: before.siteId } }), 'Proyek bukan milik site ini.');
    const row = await tx.csmsSiteApplication.update({ where: { id }, data: v });
    const d = diff(before, v);
    if (d.changed) await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: id, siteId: before.siteId, ...d, note: 'Penerapan CSMS' });
    return row;
  }, { timeout: 20000 });
}

function parseSchedule(value) {
  if (value === undefined || value === null || value === '') return null;
  const list = (Array.isArray(value) ? value : String(value).split(/[\s,;]+/)).filter(Boolean);
  ensure(list.length <= 366, 'Jadwal khusus maksimal 366 tanggal.');
  return [...new Set(list.map((d) => iso(date(d, 'Tanggal jadwal'))))].sort();
}

function parseRequirementConfig(body) {
  const frequency = choice(body.frequency, FREQUENCIES, 'Frekuensi');
  const schedule = parseSchedule(body.schedule);
  ensure(frequency !== 'CUSTOM' || schedule?.length, 'Jadwal khusus wajib berisi minimal satu tanggal.');
  return {
    responsibility: choice(body.responsibility, RESPONSIBILITIES, 'Penanggung jawab'),
    frequency,
    dueDays: body.dueDays === '' || body.dueDays == null ? null : int(body.dueDays, 'Tenggat (hari setelah periode)', 0, 365),
    dueDate: optionalDate(body.dueDate, 'Tenggat'),
    schedule: frequency === 'CUSTOM' ? schedule : null,
    picRole: optionalChoice(body.picRole, PIC_ROLES, 'PIC utama'),
    picName: text(body.picName, 'Nama PIC', 150, true),
    supportRoles: text(body.supportRoles, 'Bagian pendukung', 300, true),
    evidenceGuide: text(body.evidenceGuide, 'Petunjuk bukti site', 2000, true),
    ownerReference: text(body.ownerReference, 'Acuan owner', 500, true),
  };
}
const REQ_FIELDS = ['responsibility', 'frequency', 'dueDays', 'dueDate', 'schedule', 'picRole', 'picName', 'supportRoles', 'evidenceGuide', 'ownerReference'];

/** HO: atur persyaratan per site (frekuensi, tenggat, PIC, petunjuk) dan keputusan N/A. */
export async function updateRequirement(user, reqId, body) {
  object(body, ['action', 'reason', 'isActive', 'code', 'text', 'sourceRef', ...REQ_FIELDS]);
  const action = choice(body.action ?? 'CONFIG', ['CONFIG', 'REQUEST_NA', 'APPROVE_NA', 'REJECT_NA', 'SET_NA', 'SET_APPLICABLE'], 'Aksi');
  return prisma.$transaction(async (tx) => {
    const before = await tx.csmsRequirement.findUnique({ where: { id: reqId }, include: { application: true } });
    ensure(before, 'Persyaratan tidak ditemukan.', 404);
    const siteId = before.application.siteId;
    assertSite(user, siteId);
    let data;
    if (action === 'REQUEST_NA') {
      // HSE Site mengusulkan N/A; berlaku setelah disetujui HO.
      ensure(['HSE_SITE', 'HO_HSE'].includes(user.role), 'Anda tidak dapat mengusulkan N/A.', 403);
      ensure(before.applicability === 'APPLICABLE', 'Butir ini sudah N/A atau menunggu keputusan.', 409);
      data = { applicability: 'NA_PENDING', naReason: text(body.reason, 'Alasan N/A', 1000), naRequestedByName: actorName(user), naDecidedByName: null, naDecidedAt: null };
    } else {
      requireManager(user);
      if (action === 'APPROVE_NA') {
        ensure(before.applicability === 'NA_PENDING', 'Tidak ada usulan N/A.', 409);
        data = { applicability: 'NA', naDecidedByName: actorName(user), naDecidedAt: new Date() };
      } else if (action === 'REJECT_NA') {
        ensure(before.applicability === 'NA_PENDING', 'Tidak ada usulan N/A.', 409);
        data = { applicability: 'APPLICABLE', naDecidedByName: actorName(user), naDecidedAt: new Date(), naReason: `${before.naReason ?? ''} — ditolak: ${text(body.reason, 'Alasan penolakan', 1000)}` };
      } else if (action === 'SET_NA') {
        data = { applicability: 'NA', naReason: text(body.reason, 'Alasan N/A', 1000), naRequestedByName: actorName(user), naDecidedByName: actorName(user), naDecidedAt: new Date() };
      } else if (action === 'SET_APPLICABLE') {
        data = { applicability: 'APPLICABLE', naDecidedByName: actorName(user), naDecidedAt: new Date() };
      } else {
        data = { ...parseRequirementConfig(body), ...(body.isActive === undefined ? {} : { isActive: bool(body.isActive) }) };
        if (before.origin === 'SITE_ADDITION') {
          data.code = text(body.code, 'Kode butir tambahan', 20);
          data.text = text(body.text, 'Persyaratan tambahan', 3000);
          data.sourceRef = text(body.sourceRef, 'Acuan kontrak/surat owner', 500);
        }
      }
    }
    const row = await tx.csmsRequirement.update({ where: { id: reqId }, data });
    const auditAction = { REQUEST_NA: 'SUBMIT', APPROVE_NA: 'APPROVE', REJECT_NA: 'REJECT' }[action] ?? 'UPDATE';
    await audit(tx, user, { action: auditAction, module: 'csms', recordId: reqId, siteId, ...diff(before, data), note: 'Persyaratan site: ' + action });
    if (action === 'REQUEST_NA') {
      await notifyRoles(tx, ['HO_HSE'], siteId, { type: 'CSMS', title: 'Usulan N/A butir CSMS', body: data.naReason, link: `/csms/requirements/${reqId}`, severity: 'INFO', dedupeKey: `csms-na-${reqId}-${Date.now()}` });
    }
    return row;
  }, { timeout: 20000 });
}

/** HO: butir tambahan site (dari kontrak/surat owner). Ikut kelengkapan, tidak menambah nilai maksimum template. */
export async function addSiteRequirement(user, applicationId, body) {
  requireManager(user);
  object(body, ['elementId', 'code', 'text', 'sourceRef', ...REQ_FIELDS]);
  return prisma.$transaction(async (tx) => {
    const app = await tx.csmsSiteApplication.findUnique({ where: { id: applicationId } });
    ensure(app, 'Penerapan tidak ditemukan.', 404);
    const elementId = idOf(body.elementId, 'Unsur');
    ensure(await tx.csmsElement.findFirst({ where: { id: elementId, templateId: app.templateId } }), 'Unsur bukan bagian template ini.');
    const data = {
      applicationId, elementId, origin: 'SITE_ADDITION',
      code: text(body.code, 'Kode butir tambahan', 20), text: text(body.text, 'Persyaratan tambahan', 3000), sourceRef: text(body.sourceRef, 'Acuan kontrak/surat owner', 500),
      ...parseRequirementConfig(body),
    };
    ensure(!(await tx.csmsRequirement.findFirst({ where: { applicationId, code: data.code } })), `Kode ${data.code} sudah dipakai di penerapan ini.`, 409);
    const row = await tx.csmsRequirement.create({ data });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: row.id, siteId: app.siteId, after: data, note: 'Butir tambahan site' });
    return row;
  }, { timeout: 20000 });
}

export async function getApplication(user, id) {
  const app = await prisma.csmsSiteApplication.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, code: true, name: true, projects: { select: { id: true, name: true, owner: true, status: true } } } },
      template: { include: { elements: { orderBy: { number: 'asc' } } } },
      requirements: { include: { item: true, element: true }, orderBy: [{ element: { number: 'asc' } }, { item: { sortOrder: 'asc' } }, { code: 'asc' }] },
    },
  });
  ensure(app, 'Penerapan tidak ditemukan.', 404);
  assertSite(user, app.siteId);
  return app;
}

// ─── Checklist & bukti (lapis 3) ────────────────────────────────────────────

const reqText = (r) => (r.origin === 'SITE_ADDITION' ? r.text : r.item?.displayText || r.item?.sourceText);
const reqCode = (r) => (r.origin === 'SITE_ADDITION' ? r.code : r.item?.sourceCode ? r.item.sourceCode : `${r.item?.refCode ?? ''} (lanjutan)`.trim());

/** Penerapan yang dapat dibuka pengguna; dipakai sebagai pilihan filter. */
export const accessibleApplications = (user) => listApplications(user, {});

function nextActionFor(user, status, requireReview, responsibility) {
  const actions = csmsActions(user.role, status, requireReview).filter((a) => !(user.role === 'HSE_SITE' && responsibility === 'HO' && ['SAVE', 'SUBMIT', 'REVISE'].includes(a)));
  if (actions.includes('VERIFY')) return 'Verifikasi HO';
  if (actions.includes('REVIEW')) return 'Periksa PJO/PM';
  if (actions.includes('SUBMIT')) return status === 'REVISION' ? 'Perbaiki & ajukan ulang' : 'Lengkapi bukti & ajukan';
  return status === 'SUBMITTED' ? (requireReview ? 'Menunggu PJO/PM' : 'Menunggu verifikasi HO') : status === 'REVIEWED' ? 'Menunggu verifikasi HO' : status === 'VERIFIED' ? '—' : 'Menunggu pengisi';
}

/**
 * Checklist satu penerapan untuk bulan tampilan. Satu baris per butir; status butir berkala
 * diringkas dari status setiap periodenya yang sudah dimulai.
 */
export async function checklist(user, f = {}) {
  const apps = await accessibleApplications(user);
  const app = apps.find((a) => a.id === f.applicationId) ?? (f.siteId ? apps.find((a) => a.siteId === f.siteId) : null) ?? apps[0] ?? null;
  const month = MONTH_RE.test(f.period ?? '') ? f.period : todayIso().slice(0, 7);
  if (!app) return { apps, app: null, month, rows: [], total: 0, summary: completeness([]), elements: [] };
  const { start, end } = monthRange(month);
  const now = today();
  const threshold = (await getSetting('reminder.thresholds')).document;
  const reqs = await prisma.csmsRequirement.findMany({
    where: { applicationId: app.id, isActive: true, ...requirementScope(user) },
    include: { item: true, element: true },
    orderBy: [{ element: { number: 'asc' } }, { item: { sortOrder: 'asc' } }, { code: 'asc' }],
  });
  const fuls = await prisma.csmsFulfillment.findMany({
    where: { requirementId: { in: reqs.map((r) => r.id) }, OR: [{ periodKey: 'AWAL' }, { periodStart: { lte: end }, periodEnd: { gte: start } }] },
    include: { evidenceLinks: { include: { evidence: { select: { validUntil: true } } } } },
  });
  const byReq = fuls.reduce((m, x) => ((m[x.requirementId] ??= []).push(x), m), {});
  const rows = reqs.map((r) => {
    const mine = byReq[r.id] ?? [];
    const periods = r.frequency === 'EVENT'
      ? mine.map((x) => ({ periodKey: x.periodKey, start: x.periodStart, end: x.periodEnd, dueDate: x.dueDate }))
      : requiredPeriods(r, start, end, { startDate: app.startDate, endDate: app.endDate });
    const detail = periods.map((p) => {
      const x = mine.find((m) => m.periodKey === p.periodKey);
      const validUntil = x?.evidenceLinks.map((l) => l.evidence.validUntil).filter(Boolean).sort((a, b) => a - b)[0] ?? null;
      const status = x?.status ?? 'BELUM';
      return { periodKey: p.periodKey, start: p.start, end: p.end, dueDate: x?.dueDate ?? p.dueDate, status, fulfillmentId: x?.id ?? null, evidenceCount: x?.evidenceLinks.length ?? 0, reviewNote: x?.reviewNote ?? null, flags: derivedFlags({ status, dueDate: x?.dueDate ?? p.dueDate, validUntil }, now, threshold), started: p.start <= now };
    });
    const relevant = detail.filter((d) => d.started || d.status !== 'BELUM');
    const status = r.applicability !== 'APPLICABLE' ? r.applicability : rollupStatus(relevant.map((d) => d.status)) ?? (detail.length ? 'BELUM' : null);
    const open = detail.filter((d) => d.status !== 'VERIFIED' && d.dueDate).sort((a, b) => a.dueDate - b.dueDate)[0];
    return {
      id: r.id, code: reqCode(r), internalCode: r.item?.internalCode ?? r.code, origin: r.origin, element: { number: r.element.number, name: r.element.name },
      text: reqText(r), responsibility: r.responsibility, picRole: r.picRole, picName: r.picName, frequency: r.frequency, applicability: r.applicability,
      periods: detail, status, nextDue: open?.dueDate ?? null,
      flags: [...new Set(detail.flatMap((d) => d.flags))],
      evidenceCount: detail.reduce((s, d) => s + d.evidenceCount, 0),
      reviewNote: detail.find((d) => d.reviewNote && d.status === 'REVISION')?.reviewNote ?? null,
      nextAction: status && r.applicability === 'APPLICABLE' ? nextActionFor(user, relevant.find((d) => d.status !== 'VERIFIED')?.status ?? status, app.requireReview, r.responsibility) : '—',
      canFill: canFill(user, app, r),
    };
  });
  const summary = completeness(rows.filter((r) => r.status !== null));
  let filtered = rows;
  if (f.element) filtered = filtered.filter((r) => String(r.element.number) === String(f.element));
  if (f.status) filtered = filtered.filter((r) => (f.status === 'OVERDUE' ? r.flags.includes('OVERDUE') : f.status === 'EXPIRED' ? r.flags.includes('EVIDENCE_EXPIRED') : r.status === f.status));
  if (f.pic) filtered = filtered.filter((r) => r.picRole === f.pic);
  if (f.q) {
    const q = String(f.q).toLowerCase().slice(0, 80);
    filtered = filtered.filter((r) => [r.code, r.internalCode, r.text, r.picName].some((x) => x?.toLowerCase().includes(q)));
  }
  const skip = f.skip ?? 0, take = f.take ?? 50;
  const elements = [...new Map(reqs.map((r) => [r.element.number, r.element.name])).entries()].map(([number, name]) => ({ number, name }));
  return { apps, app, month, rows: filtered.slice(skip, skip + take), total: filtered.length, summary, elements, threshold };
}

function canFill(user, app, req) {
  if (!['HSE_SITE', 'HO_HSE'].includes(user.role) || !canSeeSite(user, app.siteId)) return false;
  return user.role === 'HO_HSE' || req.responsibility !== 'HO';
}

async function loadRequirement(db, user, reqId) {
  const r = await db.csmsRequirement.findUnique({
    where: { id: reqId },
    include: { item: true, element: true, application: { include: { site: { select: { id: true, code: true, name: true } }, template: { select: { id: true, code: true, version: true, name: true, ownerName: true, sourceDocCode: true, sourceRevision: true } } } } },
  });
  ensure(r, 'Butir CSMS tidak ditemukan.', 404);
  assertSite(user, r.application.siteId);
  if (user.role === 'HRD' && r.picRole !== 'HRD') throw new InputError('Butir ini bukan tanggung jawab HRD.', 403);
  return r;
}

function resolvePeriod(req, key) {
  const p = periodOf(req.frequency, key, { startDate: req.application.startDate, schedule: req.schedule });
  ensure(p, 'Periode tidak valid untuk frekuensi butir ini.');
  return { ...p, dueDate: dueDateOf(req, p) };
}

async function ensureFulfillment(tx, req, periodKey) {
  const p = resolvePeriod(req, periodKey);
  return tx.csmsFulfillment.upsert({
    where: { requirementId_periodKey: { requirementId: req.id, periodKey: p.periodKey } },
    update: {},
    create: { requirementId: req.id, siteId: req.application.siteId, periodKey: p.periodKey, periodStart: p.start, periodEnd: p.end, dueDate: p.dueDate, status: 'DRAFT' },
  });
}

function assertCanFill(user, req) {
  if (!canFill(user, req.application, req)) throw new InputError(req.responsibility === 'HO' ? 'Butir tanggung jawab HO hanya diisi HO HSE.' : 'Anda tidak dapat mengisi butir ini.', 403);
  ensure(req.applicability === 'APPLICABLE', 'Butir N/A tidak perlu diisi.', 409);
  ensure(req.application.status === 'ACTIVE', 'Penerapan CSMS ini sudah berakhir.', 409);
}

/** Detail butir: persyaratan lengkap, acuan template, dokumen induk, bukti per periode, riwayat. */
export async function requirementDetail(user, reqId, periodKey) {
  const r = await loadRequirement(prisma, user, reqId);
  const key = periodKey || (r.frequency === 'CUSTOM' ? (r.schedule ?? []).find((d) => d >= todayIso()) ?? (r.schedule ?? []).at(-1) : currentPeriodKey(r.frequency, today()));
  const fulfillments = await prisma.csmsFulfillment.findMany({
    where: { requirementId: r.id },
    orderBy: { periodStart: 'desc' },
    take: 36,
    include: { evidenceLinks: { include: { evidence: true }, orderBy: { linkedAt: 'asc' } }, submissions: { orderBy: { version: 'desc' } } },
  });
  const current = fulfillments.find((x) => x.periodKey === key) ?? null;
  const docIds = new Set(fulfillments.flatMap((x) => x.evidenceLinks.map((l) => l.evidence.documentId)).filter(Boolean));
  const [masterDocs, approvals] = await Promise.all([
    r.itemId
      ? prisma.hseDocument.findMany({ where: { AND: [visibleDocumentWhere(user), { csmsItems: { some: { itemId: r.itemId } } }, { status: { not: 'ARSIP' } }] }, include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } } })
      : [],
    current ? prisma.approvalLog.findMany({ where: { entityType: 'CSMS_FULFILLMENT', entityId: current.id }, orderBy: { createdAt: 'desc' } }) : [],
  ]);
  const docs = Object.fromEntries((await prisma.hseDocument.findMany({ where: { id: { in: [...docIds] } }, include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } } })).map((d) => [d.id, d]));
  const files = await evidenceFiles(fulfillments.flatMap((x) => x.evidenceLinks.map((l) => l.evidence)));
  const status = current?.status ?? 'BELUM';
  const lastSnapshot = current?.submissions.find((s) => s.outcome === 'VERIFIED')?.evidence ?? null;
  return {
    requirement: { ...r, text: reqText(r), code: reqCode(r) },
    periodKey: key,
    period: key ? periodOf(r.frequency, key, { startDate: r.application.startDate, schedule: r.schedule }) : null,
    current: current && decorateFulfillment(current, docs, files, lastSnapshot),
    status,
    actions: csmsActions(user.role, status, r.application.requireReview).filter((a) => canFill(user, r.application, r) || !['SAVE', 'SUBMIT', 'REVISE'].includes(a)),
    canFill: canFill(user, r.application, r) && r.applicability === 'APPLICABLE',
    canManage: canManageCsms(user),
    masterDocs,
    history: fulfillments.map((x) => ({ id: x.id, periodKey: x.periodKey, status: x.status, version: x.version, dueDate: x.dueDate, verifiedAt: x.verifiedAt, evidenceCount: x.evidenceLinks.length })),
    approvals,
  };
}

async function evidenceFiles(evidence) {
  const ids = evidence.map((e) => e.fileId).filter(Boolean);
  if (!ids.length) return {};
  return Object.fromEntries((await prisma.fileObject.findMany({ where: { id: { in: ids } }, select: { id: true, fileName: true, mimeType: true, size: true, sha256: true } })).map((f) => [f.id, f]));
}

// Bukti yang berubah setelah verifikasi (mis. dokumen induk direvisi) ditandai perlu diperiksa ulang.
function decorateFulfillment(x, docs, files, verifiedSnapshot) {
  const verifiedVersions = Object.fromEntries((verifiedSnapshot ?? []).map((s) => [s.evidenceId, s.documentVersionId ?? s.sha256 ?? null]));
  return {
    ...x,
    evidence: x.evidenceLinks.map((l) => {
      const e = l.evidence;
      const doc = e.documentId ? docs[e.documentId] : null;
      const versionId = doc?.versions[0]?.id ?? null;
      return {
        ...e, linkedAt: l.linkedAt, linkedByName: l.linkedByName, file: e.fileId ? files[e.fileId] ?? null : null,
        document: doc ? { id: doc.id, number: doc.number, title: doc.title, revision: doc.revision, status: doc.status, versionId, fileId: doc.versions[0]?.fileId ?? null } : null,
        changedSinceVerified: x.status === 'VERIFIED' && Boolean(doc) && e.id in verifiedVersions && verifiedVersions[e.id] !== versionId,
      };
    }),
  };
}

async function snapshotEvidence(tx, fulfillmentId) {
  const links = await tx.csmsEvidenceLink.findMany({ where: { fulfillmentId }, include: { evidence: true } });
  const docIds = links.map((l) => l.evidence.documentId).filter(Boolean);
  const fileIds = links.map((l) => l.evidence.fileId).filter(Boolean);
  const [versions, fileRows] = await Promise.all([
    tx.hseDocumentVersion.findMany({ where: { documentId: { in: docIds } }, orderBy: { createdAt: 'desc' } }),
    tx.fileObject.findMany({ where: { id: { in: fileIds } }, select: { id: true, sha256: true, fileName: true } }),
  ]);
  return links.map(({ evidence: e }) => {
    const v = e.documentId ? versions.find((x) => x.documentId === e.documentId) : null;
    const f = e.fileId ? fileRows.find((x) => x.id === e.fileId) : null;
    return { evidenceId: e.id, kind: e.kind, title: e.title, fileId: e.fileId, fileName: f?.fileName ?? null, sha256: f?.sha256 ?? null, documentId: e.documentId, documentVersionId: v?.id ?? null, documentFileId: v?.fileId ?? null, revision: v?.revision ?? null, validUntil: e.validUntil ? iso(e.validUntil) : null };
  });
}

/** Simpan draft / ajukan / periksa / kembalikan / verifikasi / buka ulang satu pemenuhan periode. */
export async function transition(user, reqId, body) {
  object(body, ['periodKey', 'action', 'note']);
  const action = choice(body.action, ['SAVE', 'SUBMIT', 'REVISE', 'REVIEW', 'RETURN', 'VERIFY', 'REOPEN'], 'Aksi');
  const note = text(body.note, 'Catatan', 2000, true);
  const result = await prisma.$transaction(async (tx) => {
    const req = await loadRequirement(tx, user, reqId);
    const periodKey = text(body.periodKey, 'Periode', 20);
    const existing = await tx.csmsFulfillment.findUnique({ where: { requirementId_periodKey: { requirementId: req.id, periodKey } } });
    const status = existing?.status ?? 'BELUM';
    const rule = csmsTransition(user.role, action, status, req.application.requireReview);
    if (!rule) throw new InputError(`Aksi ini tidak tersedia untuk peran Anda pada status ${status}.`, 409);
    if (['SAVE', 'SUBMIT', 'REVISE'].includes(action)) assertCanFill(user, req);
    if (rule.noteRequired) ensure(note, 'Catatan revisi wajib diisi.');
    const ful = existing ?? (await ensureFulfillment(tx, req, periodKey));
    const actor = actorName(user);
    const data = { status: rule.to, lastActorName: actor };
    if (action === 'SAVE') data.note = note;
    if (action === 'SUBMIT') {
      ensure((await tx.csmsEvidenceLink.count({ where: { fulfillmentId: ful.id } })) > 0, 'Tautkan minimal satu bukti sebelum mengajukan.');
      const version = ful.version + 1;
      await tx.csmsSubmission.updateMany({ where: { fulfillmentId: ful.id, outcome: { in: ['PENDING', 'REVIEWED'] } }, data: { outcome: 'SUPERSEDED' } });
      await tx.csmsSubmission.create({ data: { fulfillmentId: ful.id, version, note: note ?? ful.note, evidence: await snapshotEvidence(tx, ful.id), submittedById: user.id, submittedByName: actor } });
      Object.assign(data, { version, submittedAt: new Date(), reviewNote: null, ...(note ? { note } : {}) });
    }
    const pending = await tx.csmsSubmission.findFirst({ where: { fulfillmentId: ful.id }, orderBy: { version: 'desc' } });
    if (action === 'REVIEW') await tx.csmsSubmission.update({ where: { id: pending.id }, data: { outcome: 'REVIEWED', reviewedByName: actor, reviewedAt: new Date(), reviewNote: note } });
    if (action === 'RETURN') {
      await tx.csmsSubmission.update({ where: { id: pending.id }, data: status === 'SUBMITTED' && req.application.requireReview ? { outcome: 'RETURNED', reviewedByName: actor, reviewedAt: new Date(), reviewNote: note } : { outcome: 'RETURNED', decidedByName: actor, decidedAt: new Date(), decisionNote: note } });
      data.reviewNote = note;
    }
    if (action === 'VERIFY') {
      await tx.csmsSubmission.update({ where: { id: pending.id }, data: { outcome: 'VERIFIED', decidedByName: actor, decidedAt: new Date(), decisionNote: note } });
      Object.assign(data, { verifiedAt: new Date(), verifiedByName: actor, reviewNote: note });
    }
    if (action === 'REOPEN') Object.assign(data, { reviewNote: note });
    const row = await tx.csmsFulfillment.update({ where: { id: ful.id }, data });
    if (action !== 'SAVE') {
      await logApproval(tx, user, { entityType: 'CSMS_FULFILLMENT', entityId: ful.id, step: action, decision: rule.to, note });
    }
    await audit(tx, user, { action: { SAVE: 'UPDATE', SUBMIT: 'SUBMIT', REVISE: 'UPDATE', REVIEW: 'APPROVE', RETURN: 'REJECT', VERIFY: 'APPROVE', REOPEN: 'REJECT' }[action], module: 'csms', recordId: ful.id, siteId: req.application.siteId, before: { status }, after: { status: rule.to, periodKey, version: row.version }, note: `${reqCode(req)} ${periodKey}: ${action}${note ? ' — ' + note : ''}` });
    return { row, req, status };
  }, { timeout: 20000 });
  await notifyTransition(result.req, result.row, action, note);
  return result.row;
}

async function notifyTransition(req, ful, action, note) {
  const site = req.application.site;
  const link = `/csms/requirements/${req.id}?period=${encodeURIComponent(ful.periodKey)}`;
  const label = `${reqCode(req)} · ${site.code} · ${ful.periodKey}`;
  const base = { type: 'CSMS', link, dedupeKey: `csms-${ful.id}-v${ful.version}-${action}` };
  if (action === 'SUBMIT') {
    const roles = req.application.requireReview ? ['PJO', 'PM'] : ['HO_HSE'];
    await notifyRoles(prisma, roles, site.id, { ...base, title: `Pengajuan CSMS baru: ${label}`, body: `Versi ${ful.version} menunggu ${req.application.requireReview ? 'pemeriksaan PJO/PM' : 'verifikasi HO'}.` });
  } else if (action === 'REVIEW') {
    await notifyRoles(prisma, ['HO_HSE'], site.id, { ...base, title: `CSMS siap diverifikasi: ${label}`, body: `Sudah diperiksa PJO/PM${note ? ': ' + note : '.'}` });
  } else if (['RETURN', 'REOPEN'].includes(action)) {
    await notifyRoles(prisma, ['HSE_SITE'], site.id, { ...base, severity: 'WARNING', title: `CSMS perlu revisi: ${label}`, body: note ?? 'Lihat catatan pemeriksaan.' });
  } else if (action === 'VERIFY') {
    await notifyRoles(prisma, ['HSE_SITE'], site.id, { ...base, title: `CSMS terverifikasi: ${label}`, body: 'Verifikasi internal PJM (bukan persetujuan owner).' });
  }
}

function parseEvidenceMeta(body) {
  return {
    title: text(body.title, 'Judul bukti', 200),
    description: text(body.description, 'Keterangan', 1000, true),
    evidenceDate: optionalDate(body.evidenceDate, 'Tanggal bukti'),
    validUntil: optionalDate(body.validUntil, 'Berlaku sampai'),
  };
}

async function editableFulfillment(tx, user, reqId, periodKey) {
  const req = await loadRequirement(tx, user, reqId);
  assertCanFill(user, req);
  const ful = await ensureFulfillment(tx, req, text(periodKey, 'Periode', 20));
  ensure(EDITABLE.includes(ful.status), 'Bukti hanya dapat diubah pada status Draft atau Perlu revisi. Untuk bukti terverifikasi, pilih "Ubah bukti" agar diperiksa ulang.', 409);
  return { req, ful };
}

/** Unggah file bukti baru (satu file = satu bukti) lalu tautkan ke pemenuhan periode. */
export async function uploadEvidence(user, reqId, body, files) {
  object(body, ['periodKey', 'title', 'description', 'evidenceDate', 'validUntil']);
  const meta = parseEvidenceMeta(body);
  const valid = (files ?? []).filter((f) => f && typeof f === 'object' && f.size > 0);
  ensure(valid.length, 'Pilih file bukti.');
  return prisma.$transaction(async (tx) => {
    const { req, ful } = await editableFulfillment(tx, user, reqId, body.periodKey);
    const siteId = req.application.siteId;
    const created = [];
    for (const [i, file] of valid.entries()) {
      const ev = await tx.csmsEvidence.create({ data: { ...meta, title: valid.length > 1 ? `${meta.title} (${i + 1})` : meta.title, siteId, kind: 'FILE', createdById: user.id, createdByName: actorName(user) } });
      const [stored] = await attachFiles(tx, user, [file], { entityType: EVIDENCE_SOURCE, entityId: ev.id, siteId, label: meta.title });
      await tx.csmsEvidence.update({ where: { id: ev.id }, data: { fileId: stored.id } });
      await tx.csmsEvidenceLink.create({ data: { evidenceId: ev.id, fulfillmentId: ful.id, linkedByName: actorName(user) } });
      created.push(ev.id);
    }
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: ful.id, siteId, after: { evidence: created, title: meta.title }, note: `Unggah bukti ${reqCode(req)} ${ful.periodKey}` });
    return { fulfillmentId: ful.id, evidence: created };
  }, { timeout: 30000 });
}

/** Tautkan bukti yang sudah ada (satu bukti dipakai banyak butir) atau dokumen induk tanpa unggah ulang. */
export async function linkEvidence(user, reqId, body) {
  object(body, ['periodKey', 'evidenceId', 'documentId', 'title', 'validUntil']);
  return prisma.$transaction(async (tx) => {
    const { req, ful } = await editableFulfillment(tx, user, reqId, body.periodKey);
    const siteId = req.application.siteId;
    let evidenceId;
    if (body.documentId) {
      const documentId = idOf(body.documentId, 'Dokumen');
      const doc = await tx.hseDocument.findFirst({ where: { AND: [{ id: documentId }, visibleDocumentWhere(user), { OR: [{ siteId: null }, { siteId }] }] } });
      ensure(doc, 'Dokumen tidak ditemukan atau tidak boleh diakses site ini.', 404);
      // Satu catatan bukti per dokumen per site, dipakai ulang lintas butir.
      const existing = await tx.csmsEvidence.findFirst({ where: { kind: 'DOCUMENT', documentId, siteId } });
      evidenceId = existing?.id ?? (await tx.csmsEvidence.create({ data: { siteId, kind: 'DOCUMENT', documentId, title: `${doc.number} — ${doc.title}`, validUntil: doc.validUntil, createdById: user.id, createdByName: actorName(user) } })).id;
    } else {
      evidenceId = idOf(body.evidenceId, 'Bukti');
      const ev = await tx.csmsEvidence.findUnique({ where: { id: evidenceId } });
      ensure(ev && ev.siteId === siteId, 'Bukti tidak ditemukan untuk site ini.', 404);
    }
    const dup = await tx.csmsEvidenceLink.findUnique({ where: { evidenceId_fulfillmentId: { evidenceId, fulfillmentId: ful.id } } });
    ensure(!dup, 'Bukti ini sudah ditautkan.', 409);
    await tx.csmsEvidenceLink.create({ data: { evidenceId, fulfillmentId: ful.id, linkedByName: actorName(user) } });
    await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: ful.id, siteId, after: { linked: evidenceId }, note: `Tautkan bukti ${reqCode(req)} ${ful.periodKey}` });
    return { fulfillmentId: ful.id, evidenceId };
  }, { timeout: 20000 });
}

/** Lepas tautan bukti dari periode (file & catatan bukti tetap tersimpan untuk riwayat). */
export async function unlinkEvidence(user, fulfillmentId, evidenceId) {
  return prisma.$transaction(async (tx) => {
    const ful = await tx.csmsFulfillment.findUnique({ where: { id: fulfillmentId } });
    ensure(ful, 'Pemenuhan tidak ditemukan.', 404);
    const req = await loadRequirement(tx, user, ful.requirementId);
    assertCanFill(user, req);
    ensure(EDITABLE.includes(ful.status), 'Bukti hanya dapat dilepas pada status Draft atau Perlu revisi.', 409);
    await tx.csmsEvidenceLink.delete({ where: { evidenceId_fulfillmentId: { evidenceId, fulfillmentId } } });
    await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: fulfillmentId, siteId: ful.siteId, before: { linked: evidenceId }, note: `Lepas bukti ${reqCode(req)} ${ful.periodKey}` });
    return { ok: true };
  }, { timeout: 20000 });
}

/** Pustaka bukti site untuk dipakai ulang di butir lain. */
export async function listEvidence(user, { siteId, q } = {}) {
  const sid = idOf(siteId, 'Site');
  assertSite(user, sid);
  ensure(user.role !== 'HRD', 'Pustaka bukti CSMS tidak tersedia untuk peran ini.', 403);
  const term = q ? String(q).slice(0, 80) : null;
  const rows = await prisma.csmsEvidence.findMany({
    where: { siteId: sid, ...(term ? { title: { contains: term, mode: 'insensitive' } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { links: true } } },
  });
  return { rows };
}

/** Dokumen yang boleh ditautkan sebagai bukti site: dokumen HO yang terlihat oleh site + dokumen site itu. */
export async function linkableDocuments(user, { siteId, q } = {}) {
  const sid = idOf(siteId, 'Site');
  assertSite(user, sid);
  const term = q ? String(q).slice(0, 80) : null;
  const rows = await prisma.hseDocument.findMany({
    where: { AND: [visibleDocumentWhere(user), { OR: [{ siteId: null }, { siteId: sid }] }, { status: { not: 'ARSIP' } }, term ? { OR: [{ title: { contains: term, mode: 'insensitive' } }, { number: { contains: term, mode: 'insensitive' } }] } : {}] },
    orderBy: [{ category: 'asc' }, { number: 'asc' }],
    take: 50,
    select: { id: true, number: true, title: true, revision: true, siteId: true, validUntil: true, category: true },
  });
  return { rows };
}

/** Akses file bukti mengikuti akses butir CSMS-nya (bukan hanya site). */
export async function canReadEvidenceFile(user, fileRow) {
  if (!canAccess(user.role, '/csms') || !canSeeSite(user, fileRow.siteId)) return false;
  if (user.role !== 'HRD') return true;
  return (await prisma.csmsEvidenceLink.count({ where: { evidenceId: fileRow.entityId, fulfillment: { requirement: { picRole: 'HRD' } } } })) > 0;
}

// ─── Verifikasi: antrean pemeriksaan ────────────────────────────────────────

export async function reviewQueue(user, f = {}) {
  const scope = siteScope(user);
  const where = { status: { in: ['SUBMITTED', 'REVIEWED'] }, ...(scope === null ? {} : { siteId: { in: scope } }), ...(f.siteId ? { siteId: String(f.siteId) } : {}) };
  if (user.role === 'HRD') where.requirement = { picRole: 'HRD' };
  const rows = await prisma.csmsFulfillment.findMany({
    where,
    orderBy: { submittedAt: 'asc' },
    take: 200,
    include: {
      requirement: { include: { item: { select: { sourceCode: true, refCode: true, internalCode: true, sourceText: true, displayText: true } }, element: { select: { number: true, name: true } }, application: { select: { requireReview: true, site: { select: { code: true } } } } } },
      submissions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { evidenceLinks: true } },
    },
  });
  const items = rows.map((x) => {
    const r = x.requirement;
    const s = x.submissions[0];
    const actions = csmsActions(user.role, x.status, r.application.requireReview).filter((a) => ['REVIEW', 'RETURN', 'VERIFY'].includes(a));
    return {
      id: x.id, requirementId: r.id, site: r.application.site.code, code: reqCode(r), element: r.element, text: reqText(r), periodKey: x.periodKey, status: x.status,
      version: x.version, submittedByName: s?.submittedByName, submittedAt: s?.submittedAt ?? x.submittedAt, evidenceCount: x._count.evidenceLinks,
      reviewer: x.status === 'REVIEWED' ? s?.reviewedByName : null, requireReview: r.application.requireReview, actions,
    };
  });
  const mine = f.mine === '0' ? items : items.filter((i) => i.actions.length);
  const history = await prisma.approvalLog.findMany({ where: { entityType: 'CSMS_FULFILLMENT', ...(['HO_HSE', 'DIREKSI'].includes(user.role) ? {} : { entityId: { in: (await prisma.csmsFulfillment.findMany({ where: scope === null ? {} : { siteId: { in: scope } }, select: { id: true }, take: 2000, orderBy: { updatedAt: 'desc' } })).map((x) => x.id) } }) }, orderBy: { createdAt: 'desc' }, take: 30 });
  return { items: mine, all: items.length, history };
}

/** Ringkasan antrean untuk halaman Persetujuan (diringkas per site agar tidak membanjiri daftar). */
export async function csmsPendingFor(user) {
  const scope = siteScope(user);
  const siteIn = scope === null ? {} : { siteId: { in: scope } };
  let where = null;
  if (user.role === 'HO_HSE') where = { OR: [{ status: 'REVIEWED' }, { status: 'SUBMITTED', requirement: { application: { requireReview: false } } }] };
  else if (['PJO', 'PM'].includes(user.role)) where = { status: 'SUBMITTED', requirement: { application: { requireReview: true } }, ...siteIn };
  else if (user.role === 'HSE_SITE') where = { status: 'REVISION', ...siteIn };
  if (!where) return [];
  const rows = await prisma.csmsFulfillment.groupBy({ by: ['siteId'], where, _count: true, _min: { submittedAt: true } });
  const sites = Object.fromEntries((await prisma.site.findMany({ where: { id: { in: rows.map((r) => r.siteId) } }, select: { id: true, code: true } })).map((s) => [s.id, s.code]));
  const verb = user.role === 'HO_HSE' ? 'menunggu verifikasi HO' : user.role === 'HSE_SITE' ? 'perlu revisi' : 'menunggu pemeriksaan PJO/PM';
  return rows.map((r) => ({
    kind: 'CSMS', id: 'csms-' + r.siteId, title: `${r._count} butir CSMS ${sites[r.siteId] ?? ''} ${verb}`,
    detail: 'Pemenuhan CSMS (verifikasi internal PJM).', link: user.role === 'HSE_SITE' ? `/csms?tab=checklist&status=REVISION` : `/csms?tab=verify&siteId=${r.siteId}`, since: r._min.submittedAt,
  }));
}

// ─── Ringkasan ──────────────────────────────────────────────────────────────

/** Rekap per penerapan untuk bulan tampilan. Kelengkapan terverifikasi dipisah dari nilai assessment. */
export async function overview(user, f = {}) {
  const month = MONTH_RE.test(f.period ?? '') ? f.period : todayIso().slice(0, 7);
  const apps = (await accessibleApplications(user)).filter((a) => !f.siteId || a.siteId === f.siteId);
  const perApp = [];
  for (const a of apps) {
    const c = await checklist(user, { applicationId: a.id, period: month, take: 10000 });
    const rows = c.rows;
    const count = (pred) => rows.filter(pred).length;
    perApp.push({
      app: a, summary: c.summary,
      cards: {
        applicable: c.summary.applicable,
        notFilled: count((r) => r.status === 'BELUM'),
        waiting: count((r) => ['SUBMITTED', 'REVIEWED'].includes(r.status)),
        revision: count((r) => r.status === 'REVISION'),
        verified: c.summary.verified,
        expired: count((r) => r.flags.includes('EVIDENCE_EXPIRED')),
        expiring: count((r) => r.flags.includes('EVIDENCE_EXPIRING')),
        overdue: count((r) => r.flags.includes('OVERDUE')),
        naPending: count((r) => r.applicability === 'NA_PENDING'),
      },
      byElement: c.elements.map((e) => {
        const er = rows.filter((r) => r.element.number === e.number);
        return { ...e, ...completeness(er.filter((r) => r.status !== null)) };
      }),
      todo: rows.filter((r) => r.flags.includes('OVERDUE') || r.status === 'REVISION' || r.flags.includes('EVIDENCE_EXPIRED')).slice(0, 10),
    });
  }
  const totals = perApp.reduce((t, p) => {
    for (const [k, v] of Object.entries(p.cards)) t[k] = (t[k] ?? 0) + v;
    return t;
  }, {});
  const verified = totals.verified ?? 0, applicable = totals.applicable ?? 0;
  return { month, perApp, totals, completeness: { applicable, verified, percent: applicable ? Math.round((verified / applicable) * 1000) / 10 : null }, expiringDays: (await getSetting('reminder.thresholds')).document, today: iso(today()), soon: iso(addDays(today(), 30)) };
}

// ─── Dokumen induk HO (tampilan Dokumen HSE yang ditautkan ke CSMS) ──────────

export async function masterDocuments(user, f = {}) {
  const term = f.q ? String(f.q).slice(0, 80) : null;
  const where = {
    AND: [
      visibleDocumentWhere(user),
      { siteId: null },
      f.linked === 'all' ? {} : { csmsItems: { some: {} } },
      f.status === 'ARSIP' ? { status: 'ARSIP' } : { status: { not: 'ARSIP' } },
      term ? { OR: [{ title: { contains: term, mode: 'insensitive' } }, { number: { contains: term, mode: 'insensitive' } }] } : {},
    ],
  };
  const rows = await prisma.hseDocument.findMany({
    where,
    orderBy: [{ category: 'asc' }, { number: 'asc' }],
    take: 200,
    include: {
      versions: { orderBy: { createdAt: 'desc' } },
      allowedSites: { include: { site: { select: { code: true } } } },
      csmsItems: { include: { item: { select: { id: true, internalCode: true, sourceCode: true, refCode: true, template: { select: { code: true, version: true } }, element: { select: { number: true, name: true } } } } } },
    },
  });
  const now = today();
  return {
    rows: rows.map((d) => ({
      ...d,
      expiry: !d.validUntil ? null : d.validUntil < now ? 'EXPIRED' : d.validUntil <= addDays(now, 30) ? 'EXPIRING' : 'VALID',
      elements: [...new Set(d.csmsItems.map((l) => l.item.element.number))].sort((a, b) => a - b),
    })),
  };
}

export async function saveDocumentCsms(user, documentId, body) {
  requireManager(user);
  object(body, ['accessScope', 'siteIds', 'approverName', 'effectiveDate', 'itemIds']);
  const accessScope = choice(body.accessScope ?? 'DEFAULT', ['DEFAULT', 'LISTED', 'HO_ONLY'], 'Akses site');
  const siteIds = Array.isArray(body.siteIds) ? [...new Set(body.siteIds.map((s) => idOf(s, 'Site')))] : [];
  const itemIds = Array.isArray(body.itemIds) ? [...new Set(body.itemIds.map((s) => idOf(s, 'Butir')))] : [];
  ensure(accessScope !== 'LISTED' || siteIds.length, 'Pilih minimal satu site yang boleh mengakses.');
  ensure(itemIds.length <= 500, 'Terlalu banyak butir.');
  return prisma.$transaction(async (tx) => {
    const before = await tx.hseDocument.findUnique({ where: { id: documentId }, include: { allowedSites: true, csmsItems: true } });
    ensure(before, 'Dokumen tidak ditemukan.', 404);
    ensure(before.siteId === null, 'Dokumen induk CSMS adalah dokumen HO (bukan dokumen site).');
    const data = { accessScope, approverName: text(body.approverName, 'Pengesah', 150, true), effectiveDate: optionalDate(body.effectiveDate, 'Tanggal berlaku') };
    await tx.hseDocument.update({ where: { id: documentId }, data });
    await tx.hseDocumentSite.deleteMany({ where: { documentId } });
    if (accessScope === 'LISTED') await tx.hseDocumentSite.createMany({ data: siteIds.map((siteId) => ({ documentId, siteId })) });
    await tx.hseDocumentCsmsItem.deleteMany({ where: { documentId } });
    if (itemIds.length) await tx.hseDocumentCsmsItem.createMany({ data: itemIds.map((itemId) => ({ documentId, itemId })) });
    await audit(tx, user, {
      action: 'UPDATE', module: 'documents', recordId: documentId,
      before: { accessScope: before.accessScope, approverName: before.approverName, effectiveDate: before.effectiveDate, sites: before.allowedSites.map((s) => s.siteId), items: before.csmsItems.map((i) => i.itemId) },
      after: { ...data, sites: accessScope === 'LISTED' ? siteIds : [], items: itemIds }, note: 'Metadata dokumen induk CSMS',
    });
    return { id: documentId };
  }, { timeout: 20000 });
}

/** Butir template aktif untuk pilihan tautan dokumen induk. */
export async function templateItemOptions() {
  const items = await prisma.csmsItem.findMany({
    where: { template: { status: { in: ['ACTIVE', 'DRAFT'] } } },
    orderBy: [{ template: { code: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, internalCode: true, sourceCode: true, refCode: true, sourceText: true, displayText: true, template: { select: { code: true, version: true, status: true } }, element: { select: { number: true, name: true } } },
  });
  return items;
}

/** Proyek aktif per site untuk mengaitkan penerapan dengan owner di Site & Proyek. */
export const projectOptions = () => prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, siteId: true, name: true, owner: true }, orderBy: { name: 'asc' } });
