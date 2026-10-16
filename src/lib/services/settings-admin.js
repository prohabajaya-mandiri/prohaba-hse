import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../settings-defaults.js';
import { bool, ensure, InputError, object, text } from '../validation.js';
import { logApproval } from './notify.js';

export async function listSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  return SETTING_KEYS.map((key) => ({
    key,
    label: SETTING_DEFAULTS[key].label,
    value: map[key]?.value ?? SETTING_DEFAULTS[key].value,
    defaultValue: SETTING_DEFAULTS[key].value,
    status: map[key]?.status ?? 'DRAFT',
    note: map[key]?.note ?? null,
    approvedBy: map[key]?.approvedBy ?? null,
    approvedAt: map[key]?.approvedAt ?? null,
    stored: Boolean(map[key]),
  }));
}

// Bentuk nilai harus sama dengan nilai bawaan (tipe & kunci) agar modul pemakai tidak rusak.
function sameShape(value, ref) {
  if (Array.isArray(ref)) return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === typeof ref[0]);
  if (ref && typeof ref === 'object') return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(ref).every((k) => k in value && sameShape(value[k], ref[k]));
  if (typeof ref === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  return typeof value === typeof ref;
}

export async function saveSetting(user, key, body) {
  if (user.role !== 'HO_HSE') throw new InputError('Parameter diatur HO HSE.', 403);
  ensure(SETTING_KEYS.includes(key), 'Parameter tidak dikenal.', 404);
  object(body, ['value', 'note', 'approve']);
  const approve = bool(body.approve);
  const value = body.value === undefined ? undefined : body.value;
  if (value !== undefined) ensure(sameShape(value, SETTING_DEFAULTS[key].value), 'Format nilai tidak sesuai struktur parameter.');
  const note = text(body.note, 'Catatan', 1000, true);
  return prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    const current = value ?? before?.value ?? SETTING_DEFAULTS[key].value;
    const changed = value !== undefined && JSON.stringify(value) !== JSON.stringify(before?.value ?? SETTING_DEFAULTS[key].value);
    const status = approve ? 'APPROVED' : changed ? 'DRAFT' : before?.status ?? 'DRAFT';
    const row = await tx.setting.upsert({
      where: { key },
      create: { key, value: current, status, note, updatedBy: actorName(user), ...(approve ? { approvedBy: actorName(user), approvedAt: new Date() } : {}) },
      update: { value: current, status, note, updatedBy: actorName(user), ...(approve ? { approvedBy: actorName(user), approvedAt: new Date() } : changed ? { approvedBy: null, approvedAt: null } : {}) },
    });
    if (approve) await logApproval(tx, user, { entityType: 'SETTING', entityId: key, step: 'APPROVE', decision: 'APPROVE', note });
    await audit(tx, user, { action: approve ? 'APPROVE' : 'UPDATE', module: 'settings', recordId: key, before: before ? { value: before.value, status: before.status } : null, after: { value: current, status } });
    return row;
  });
}

export async function listAudit(f, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (f.module) where.module = String(f.module);
  if (f.action) where.action = String(f.action);
  if (f.siteId) where.siteId = String(f.siteId);
  if (f.recordId) where.recordId = String(f.recordId);
  if (f.q) where.OR = [{ actorName: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }, { note: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }];
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: new Date(f.from + 'T00:00:00Z') } : {}), ...(f.to ? { lt: new Date(new Date(f.to + 'T00:00:00Z').getTime() + 86400000) } : {}) };
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.auditLog.count({ where })]);
  return { rows, total };
}
