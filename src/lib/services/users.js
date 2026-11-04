import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ROLES } from '../access.js';
import { audit, diff } from '../audit.js';
import { bool, choice, ensure, object, optionalChoice, text } from '../validation.js';
import { readUpload, storeFile } from '../files.js';
import { THEME_KEYS } from '../domain/profile.js';
import { detachFiles, purgeObjects, requireDelete } from './common.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ['name', 'email', 'password', 'role', 'region', 'isShared', 'isActive', 'siteIds'];
const SELECT = {
  id: true, name: true, email: true, role: true, region: true, isShared: true, isActive: true, lastLoginAt: true, createdAt: true,
  sites: { select: { siteId: true } },
  operators: { select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } },
};

export const listUsers = () => prisma.user.findMany({ select: SELECT, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

function password(value, optional) {
  if (optional && !value) return null;
  ensure(typeof value === 'string' && value.length >= 10 && Buffer.byteLength(value) <= 72, 'Kata sandi minimal 10 karakter.');
  return value;
}

async function parse(body, editing) {
  object(body, FIELDS);
  const data = {
    name: text(body.name, 'Nama', 120),
    email: text(body.email, 'Email', 254).toLowerCase(),
    role: choice(body.role, ROLES, 'Peran'),
    region: optionalChoice(body.region, ['TIMUR', 'BARAT'], 'Wilayah'),
    isShared: bool(body.isShared),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  ensure(EMAIL.test(data.email), 'Email tidak valid.');
  ensure(!data.isShared || data.role === 'HSE_SITE', 'Akun bersama hanya untuk HSE Site.');
  const siteIds = Array.isArray(body.siteIds) ? [...new Set(body.siteIds.filter((s) => typeof s === 'string'))] : [];
  if (['HSE_SITE', 'PJO'].includes(data.role)) ensure(siteIds.length > 0, 'Pilih minimal satu site untuk peran ini.');
  if (data.role === 'PM') ensure(siteIds.length > 0 || data.region, 'PM wajib memiliki site atau wilayah.');
  const pw = password(body.password, editing);
  if (pw) data.password = await bcrypt.hash(pw, 12);
  return { data, siteIds };
}

export async function createUser(body, actor) {
  const { data, siteIds } = await parse(body, false);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ...data, sites: { create: siteIds.map((siteId) => ({ siteId })) } }, select: SELECT });
    await audit(tx, actor, { action: 'CREATE', module: 'users', recordId: user.id, after: { ...data, password: undefined, siteIds } });
    return user;
  });
}

export async function updateUser(id, body, actor) {
  const { data, siteIds } = await parse(body, true);
  ensure(!(id === actor.id && (!data.isActive || data.role !== actor.role)), 'Anda tidak dapat menonaktifkan atau mengubah peran akun sendiri.');
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: SELECT });
    ensure(before, 'Pengguna tidak ditemukan.', 404);
    // Perubahan akses memaksa sesi lama keluar.
    const accessChanged = data.password || data.role !== before.role || data.isActive !== before.isActive || data.region !== before.region
      || JSON.stringify(before.sites.map((s) => s.siteId).sort()) !== JSON.stringify([...siteIds].sort());
    await tx.userSite.deleteMany({ where: { userId: id } });
    const user = await tx.user.update({
      where: { id },
      data: { ...data, ...(accessChanged ? { sessionVersion: { increment: 1 } } : {}), sites: { create: siteIds.map((siteId) => ({ siteId })) } },
      select: SELECT,
    });
    const d = diff({ ...before, siteIds: before.sites.map((s) => s.siteId) }, { ...data, password: data.password ? '[diubah]' : undefined, siteIds });
    await audit(tx, actor, { action: 'UPDATE', module: 'users', recordId: id, before: d.before, after: d.after });
    return user;
  });
}

// Riwayat tetap utuh: audit log menyimpan nama pelaku, kolom pembuat bukan foreign key.
export async function deleteUser(id, actor) {
  requireDelete(actor);
  ensure(id !== actor.id, 'Anda tidak dapat menghapus akun sendiri.');
  let keys = [];
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: SELECT });
    ensure(before, 'Pengguna tidak ditemukan.', 404);
    keys = await detachFiles(tx, 'AVATAR', id);
    await tx.user.delete({ where: { id } });
    const { operators, sites, ...rest } = before;
    await audit(tx, actor, { action: 'DELETE', module: 'users', recordId: id, before: { ...rest, siteIds: sites.map((s) => s.siteId), operators: operators.map((o) => o.name) } });
  });
  await purgeObjects(keys);
  return { ok: true };
}

// Reset akses: kata sandi sementara ditampilkan sekali kepada HO HSE.
export async function resetPassword(id, actor) {
  const temp = randomBytes(9).toString('base64url');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { password: await bcrypt.hash(temp, 12), sessionVersion: { increment: 1 } } });
    await audit(tx, actor, { action: 'UPDATE', module: 'users', recordId: id, note: 'Reset kata sandi' });
  });
  return { temporaryPassword: temp };
}

export async function saveOperator(userId, body, actor) {
  object(body, ['id', 'name', 'pin', 'isActive']);
  const name = text(body.name, 'Nama operator', 80);
  const pin = body.pin ? String(body.pin) : null;
  ensure(!pin || /^\d{4,12}$/.test(pin), 'PIN harus 4–12 digit angka.');
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { isShared: true } });
  ensure(owner?.isShared, 'Operator hanya untuk akun bersama.');
  return prisma.$transaction(async (tx) => {
    let op;
    if (body.id) {
      op = await tx.operator.update({
        where: { id: body.id, userId },
        data: { name, isActive: body.isActive === undefined ? true : bool(body.isActive), ...(pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}) },
        select: { id: true, name: true, isActive: true },
      });
    } else {
      ensure(pin, 'PIN wajib untuk operator baru.');
      op = await tx.operator.create({ data: { userId, name, pinHash: await bcrypt.hash(pin, 10) }, select: { id: true, name: true, isActive: true } });
    }
    await audit(tx, actor, { action: body.id ? 'UPDATE' : 'CREATE', module: 'users', recordId: userId, note: 'Operator akun bersama: ' + name });
    return op;
  });
}

// Email adalah kunci login, jadi mengubahnya wajib mengonfirmasi kata sandi.
export async function updateProfile(user, body) {
  object(body, ['name', 'email', 'currentPassword']);
  ensure(!user.isShared, 'Profil akun bersama diatur oleh HO HSE.');
  const data = { name: text(body.name, 'Nama', 120), email: text(body.email, 'Email', 254).toLowerCase() };
  ensure(EMAIL.test(data.email), 'Email tidak valid.');
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, password: true } });
  ensure(row, 'Pengguna tidak ditemukan.', 404);
  if (data.email !== row.email) {
    ensure(await bcrypt.compare(String(body.currentPassword ?? ''), row.password), 'Kata sandi salah. Email tidak diubah.');
    ensure(!(await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })), 'Email sudah dipakai akun lain.', 409);
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data });
    const d = diff({ name: row.name, email: row.email }, data);
    await audit(tx, user, { action: 'UPDATE', module: 'account', recordId: user.id, before: d.before, after: d.after, note: 'Ubah profil sendiri' });
  });
  return { ok: true };
}

export async function setTheme(user, body) {
  object(body, ['color']);
  await prisma.user.update({ where: { id: user.id }, data: { themeColor: choice(body.color, THEME_KEYS, 'Warna tema') } });
  return { ok: true };
}

export async function setAvatar(user, file) {
  const upload = await readUpload(file);
  ensure(upload.mimeType.startsWith('image/'), 'Foto profil harus berupa gambar.');
  const data = await storeFile(upload, { entityType: 'AVATAR', entityId: user.id, uploadedBy: user.id });
  let keys = [];
  const row = await prisma.$transaction(async (tx) => {
    keys = await detachFiles(tx, 'AVATAR', user.id);
    const created = await tx.fileObject.create({ data, select: { id: true } });
    await tx.user.update({ where: { id: user.id }, data: { avatarFileId: created.id } });
    return created;
  });
  await purgeObjects(keys);
  return { avatarFileId: row.id };
}

export async function removeAvatar(user) {
  let keys = [];
  await prisma.$transaction(async (tx) => {
    keys = await detachFiles(tx, 'AVATAR', user.id);
    await tx.user.update({ where: { id: user.id }, data: { avatarFileId: null } });
  });
  await purgeObjects(keys);
  return { ok: true };
}

export async function changeOwnPassword(user, body) {
  object(body, ['current', 'next']);
  ensure(!user.isShared, 'Kata sandi akun bersama diatur oleh HO HSE.');
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  ensure(row && (await bcrypt.compare(String(body.current ?? ''), row.password)), 'Kata sandi lama salah.');
  const next = password(body.next, false);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(next, 12), sessionVersion: { increment: 1 } } });
    await audit(tx, user, { action: 'UPDATE', module: 'account', recordId: user.id, note: 'Ganti kata sandi sendiri' });
  });
  return { ok: true };
}
