import { prisma } from '../prisma.js';
import { canSeeSite, siteScope } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays, today } from '../dates.js';
import { readUpload, storeFile } from '../files.js';
import { getSetting } from '../settings.js';
import { choice, date, ensure, InputError, object, optionalDate, optionalId, text } from '../validation.js';

export const DOC_CATEGORIES = ['HSE_PLAN', 'KPLH', 'SOP', 'IBPR', 'SMKP', 'AUDIT', 'STANDARISASI_MITRA', 'PRAKUALIFIKASI', 'SERTIFIKASI', 'COMPLIANCE_OWNER', 'LAINNYA'];

export const DOC_ACCESS_SCOPES = ['DEFAULT', 'LISTED', 'HO_ONLY'];
// Dokumen terbatas (legalitas/data pribadi) hanya untuk HO HSE dan Direksi.
const RESTRICTED_ROLES = ['HO_HSE', 'DIREKSI'];

/**
 * Dokumen HO (siteId null) ber-accessScope DEFAULT terlihat oleh semua peran (perilaku lama);
 * LISTED hanya untuk site terpilih; HO_ONLY hanya HO HSE/Direksi. Dokumen site mengikuti cakupan site.
 */
export function visibleDocumentWhere(user) {
  const scope = siteScope(user);
  if (scope === null) return RESTRICTED_ROLES.includes(user.role) ? {} : { NOT: { siteId: null, accessScope: 'HO_ONLY' } };
  return {
    OR: [
      { siteId: { in: scope } },
      { siteId: null, accessScope: 'DEFAULT' },
      { siteId: null, accessScope: 'LISTED', allowedSites: { some: { siteId: { in: scope } } } },
    ],
  };
}

/** Versi murni dari visibleDocumentWhere untuk satu dokumen (dipakai pemeriksaan unduhan file). */
export function canReadDocument(user, doc, allowedSiteIds = []) {
  const scope = siteScope(user);
  if (doc.siteId) return scope === null || scope.includes(doc.siteId);
  if (doc.accessScope === 'HO_ONLY') return RESTRICTED_ROLES.includes(user.role);
  if (doc.accessScope === 'LISTED') return scope === null || allowedSiteIds.some((s) => scope.includes(s));
  return true;
}

function scopeWhere(user, siteId) {
  const visible = visibleDocumentWhere(user);
  const scope = siteScope(user);
  let filter = {};
  if (siteId === 'HO') filter = { siteId: null };
  else if (siteId) filter = { siteId: scope === null || scope.includes(siteId) ? siteId : '__none__' };
  return { AND: [visible, filter] };
}

function canWriteDoc(user, siteId) {
  if (user.role === 'HO_HSE') return true;
  return user.role === 'HSE_SITE' && siteId && canSeeSite(user, siteId);
}

export async function listDocuments(user, f, { skip = 0, take = 50 } = {}) {
  const threshold = (await getSetting('reminder.thresholds')).document;
  const now = today();
  const where = { ...scopeWhere(user, f.siteId) };
  if (f.category && DOC_CATEGORIES.includes(f.category)) where.category = f.category;
  where.status = f.status === 'ARSIP' ? 'ARSIP' : f.status === 'all' ? undefined : { not: 'ARSIP' };
  if (where.status === undefined) delete where.status;
  // Kedaluwarsa hanya untuk dokumen yang memiliki masa berlaku.
  if (f.expiry === 'soon') where.validUntil = { gte: now, lte: addDays(now, threshold) };
  if (f.expiry === 'expired') where.validUntil = { lt: now };
  if (f.q) {
    const q = String(f.q).slice(0, 80);
    where.AND.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } }, { ownerName: { contains: q, mode: 'insensitive' } }] });
  }
  const [rows, total] = await Promise.all([
    prisma.hseDocument.findMany({ where, skip, take, orderBy: [{ category: 'asc' }, { number: 'asc' }], include: { site: { select: { code: true } }, versions: { orderBy: { createdAt: 'desc' } } } }),
    prisma.hseDocument.count({ where }),
  ]);
  const fileIds = rows.flatMap((r) => r.versions.map((v) => v.fileId));
  const files = Object.fromEntries((await prisma.fileObject.findMany({ where: { id: { in: fileIds } }, select: { id: true, fileName: true, mimeType: true, size: true } })).map((f) => [f.id, f]));
  return {
    threshold, total,
    rows: rows.map((r) => ({
      ...r,
      expiry: !r.validUntil ? null : r.validUntil < now ? 'EXPIRED' : r.validUntil <= addDays(now, threshold) ? 'EXPIRING' : 'VALID',
      canEdit: canWriteDoc(user, r.siteId),
      versions: r.versions.map((v) => ({ ...v, file: files[v.fileId] ?? null })),
    })),
  };
}

function parse(body) {
  return {
    number: text(body.number, 'Nomor dokumen', 80),
    title: text(body.title, 'Judul', 250),
    category: choice(body.category, DOC_CATEGORIES, 'Kategori'),
    issueDate: date(body.issueDate, 'Tanggal terbit'),
    validUntil: optionalDate(body.validUntil, 'Berlaku sampai'),
    ownerName: text(body.ownerName, 'Penanggung jawab', 150),
    status: choice(body.status ?? 'BERLAKU', ['DRAFT', 'BERLAKU', 'ARSIP'], 'Status'),
  };
}

async function addVersion(tx, user, doc, file, revision, notes) {
  ensure(file && typeof file === 'object' && file.size > 0, 'File dokumen wajib diunggah.');
  const upload = await readUpload(file);
  const data = await storeFile(upload, { sensitivity: 'GENERAL', entityType: 'DOCUMENT', entityId: doc.id, siteId: doc.siteId, label: 'Rev ' + revision, uploadedBy: user.id });
  const fileRow = await tx.fileObject.create({ data });
  return tx.hseDocumentVersion.create({ data: { documentId: doc.id, revision, fileId: fileRow.id, notes, uploadedBy: user.id } });
}

export async function createDocument(user, body, file) {
  object(body, ['number', 'title', 'category', 'siteId', 'issueDate', 'validUntil', 'ownerName', 'status', 'revision', 'notes']);
  const siteId = optionalId(body.siteId, 'Site');
  if (!canWriteDoc(user, siteId)) throw new InputError(siteId ? 'Anda tidak dapat menambah dokumen untuk site ini.' : 'Dokumen HO hanya ditambahkan HO HSE.', 403);
  const v = parse(body);
  const revision = text(body.revision ?? '0', 'Revisi', 20);
  return prisma.$transaction(async (tx) => {
    const dup = await tx.hseDocument.findFirst({ where: { number: v.number, siteId } });
    ensure(!dup, 'Nomor dokumen sudah ada; unggah sebagai revisi baru.', 409);
    const doc = await tx.hseDocument.create({ data: { ...v, siteId, revision, createdBy: user.id } });
    await addVersion(tx, user, doc, file, revision, text(body.notes, 'Catatan', 500, true));
    await audit(tx, user, { action: 'CREATE', module: 'documents', recordId: doc.id, siteId, after: { ...v, revision } });
    return doc;
  }, { timeout: 20000 });
}

export async function updateDocument(user, docId, body, file) {
  object(body, ['number', 'title', 'category', 'issueDate', 'validUntil', 'ownerName', 'status', 'revision', 'notes']);
  const before = await prisma.hseDocument.findUnique({ where: { id: docId } });
  ensure(before, 'Dokumen tidak ditemukan.', 404);
  if (!canWriteDoc(user, before.siteId)) throw new InputError('Anda tidak dapat mengubah dokumen ini.', 403);
  const v = parse(body);
  const revision = body.revision ? text(body.revision, 'Revisi', 20) : before.revision;
  return prisma.$transaction(async (tx) => {
    // Revisi baru wajib disertai file; versi lama tetap tersimpan sebagai arsip.
    if (file && file.size) {
      ensure(revision !== before.revision, 'Isi nomor revisi baru untuk file baru.');
      await addVersion(tx, user, before, file, revision, text(body.notes, 'Catatan', 500, true));
    } else {
      ensure(revision === before.revision, 'Perubahan revisi memerlukan file baru.');
    }
    const row = await tx.hseDocument.update({ where: { id: docId }, data: { ...v, revision } });
    await audit(tx, user, { action: 'UPDATE', module: 'documents', recordId: docId, siteId: before.siteId, ...diff(before, { ...v, revision }) });
    return row;
  }, { timeout: 20000 });
}
