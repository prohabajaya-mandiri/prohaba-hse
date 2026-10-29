import { api, params } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { canSeeSensitive } from '@/lib/access';
import { fileResponse, loadFile } from '@/lib/files';
import { deleteObject } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { InputError } from '@/lib/validation';
import { canReadDocument } from '@/lib/services/documents';
import { canReadEvidenceFile } from '@/lib/services/csms';
import { canReadFindingFile } from '@/lib/services/csms-findings';
import { canReadWorkPermitFile } from '@/lib/services/work-permits';

// Selain sensitivitas & site, file mengikuti hak akses entitas asalnya (dokumen terbatas, bukti CSMS).
async function entityAllows(user, row) {
  if (row.entityType === 'DOCUMENT' && row.entityId) {
    const doc = await prisma.hseDocument.findUnique({ where: { id: row.entityId }, include: { allowedSites: { select: { siteId: true } } } });
    return Boolean(doc) && canReadDocument(user, doc, doc.allowedSites.map((s) => s.siteId));
  }
  if (row.entityType === 'CSMS_EVIDENCE') return canReadEvidenceFile(user, row);
  if (row.entityType === 'CSMS_FINDING') return canReadFindingFile(user, row);
  if (row.entityType === 'WORK_PERMIT') return canReadWorkPermitFile(user, row);
  return true;
}

async function authorized(user, id) {
  const row = await prisma.fileObject.findUnique({ where: { id } });
  if (!row) throw new InputError('File tidak ditemukan.', 404);
  if (!canSeeSensitive(user, row.sensitivity, row.siteId) || !(await entityAllows(user, row))) throw new InputError('Anda tidak memiliki akses ke file ini.', 403);
  return row;
}

export const GET = api(async (request, context, user) => {
  const { id } = await params(context);
  const row = await authorized(user, id);
  if (row.sensitivity !== 'GENERAL') {
    await audit(null, user, { action: 'VIEW_SENSITIVE', module: 'files', recordId: row.id, siteId: row.siteId, note: row.sensitivity + ' ' + row.fileName });
  }
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return fileResponse(await loadFile(row), row, inline);
});

export const DELETE = api(async (request, context, user) => {
  const { id } = await params(context);
  const row = await authorized(user, id);
  // File KTP dan versi dokumen terkontrol tidak boleh dihapus (riwayat wajib tersimpan).
  if (row.sensitivity === 'KTP' || row.entityType === 'DOCUMENT' || row.entityType === 'CSMS_EVIDENCE' || row.entityType === 'CSMS_FINDING' || row.entityType === 'WORK_PERMIT') throw new InputError('File ini tidak dapat dihapus.', 409);
  if (row.uploadedBy !== user.id && user.role !== 'HO_HSE') throw new InputError('Hanya pengunggah atau HO HSE yang dapat menghapus.', 403);
  await prisma.$transaction(async (tx) => {
    await tx.fileObject.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'files', recordId: id, siteId: row.siteId, before: { fileName: row.fileName, entityType: row.entityType, entityId: row.entityId } });
  });
  await deleteObject(row.storageKey);
  return { ok: true };
});
