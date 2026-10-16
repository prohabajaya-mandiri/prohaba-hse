import { prisma } from '../prisma.js';
import { canSeeSite, canWrite, siteScope } from '../access.js';
import { ensure, InputError } from '../validation.js';
import { storeFile, readUpload } from '../files.js';

export function requireSite(user, siteId) {
  ensure(siteId, 'Site wajib dipilih.');
  if (!canSeeSite(user, siteId)) throw new InputError('Anda tidak memiliki akses ke site ini.', 403);
  return siteId;
}

export function requireWrite(user, moduleName) {
  if (!canWrite(user.role, moduleName)) throw new InputError('Anda tidak memiliki izin mengubah data ini.', 403);
}

/** Personel dalam cakupan site pengguna (berdasarkan site penempatan aktif/terakhir). */
export async function scopedPersonnel(user, id, db = prisma, select) {
  const p = await db.personnel.findUnique({ where: { id }, ...(select ? { select: { ...select, currentSiteId: true } } : {}) });
  if (!p) throw new InputError('Personel tidak ditemukan.', 404);
  const scope = siteScope(user);
  if (scope !== null && !scope.includes(p.currentSiteId)) throw new InputError('Personel di luar cakupan site Anda.', 403);
  return p;
}

export async function siteExists(db, siteId) {
  const site = await db.site.findUnique({ where: { id: siteId }, select: { id: true, isActive: true, name: true, code: true } });
  ensure(site, 'Site tidak ditemukan.', 404);
  return site;
}

/** Simpan beberapa file lampiran untuk satu entitas. */
export async function attachFiles(db, user, files, { entityType, entityId, siteId, sensitivity = 'GENERAL', label = null }) {
  const valid = (files ?? []).filter((f) => f && typeof f === 'object' && f.size > 0);
  ensure(valid.length <= 10, 'Maksimal 10 file per unggahan.');
  const rows = [];
  for (const file of valid) {
    const upload = await readUpload(file);
    const data = await storeFile(upload, { sensitivity, entityType, entityId, siteId, label, uploadedBy: user.id });
    rows.push(await db.fileObject.create({ data, select: { id: true, fileName: true, mimeType: true, label: true } }));
  }
  return rows;
}

export function filesOf(entityType, ids) {
  return prisma.fileObject.findMany({
    where: { entityType, entityId: { in: ids } },
    select: { id: true, entityId: true, fileName: true, mimeType: true, label: true, sensitivity: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

export const groupBy = (rows, key) =>
  rows.reduce((m, r) => {
    (m[r[key]] ??= []).push(r);
    return m;
  }, {});

export function formValues(form) {
  const values = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') values[k] = v;
  return values;
}
