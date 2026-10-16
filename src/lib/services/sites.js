import { prisma } from '../prisma.js';
import { siteScope } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays } from '../dates.js';
import { bool, choice, date, ensure, object, optionalDate, optionalId, text } from '../validation.js';
import { requireSite } from './common.js';

export async function listSites(user) {
  const scope = siteScope(user);
  return prisma.site.findMany({
    where: scope === null ? {} : { id: { in: scope } },
    include: {
      projects: { orderBy: [{ status: 'asc' }, { startDate: 'desc' }] },
      responsibles: { orderBy: { startDate: 'desc' } },
      _count: { select: { placements: { where: { status: 'ACTIVE' } } } },
    },
    orderBy: [{ isHo: 'desc' }, { isActive: 'desc' }, { name: 'asc' }],
  });
}

function parseSite(body) {
  object(body, ['code', 'name', 'location', 'region', 'isHo', 'isActive']);
  const code = text(body.code, 'Kode site', 20).toUpperCase();
  ensure(/^[A-Z0-9-]+$/.test(code), 'Kode site hanya huruf, angka dan tanda minus.');
  return {
    code,
    name: text(body.name, 'Nama site', 120),
    location: text(body.location, 'Lokasi', 200, true),
    region: choice(body.region, ['TIMUR', 'BARAT', 'HO'], 'Wilayah'),
    isHo: bool(body.isHo),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
}

export async function saveSite(user, id, body) {
  const data = parseSite(body);
  return prisma.$transaction(async (tx) => {
    if (!id) {
      const site = await tx.site.create({ data });
      await audit(tx, user, { action: 'CREATE', module: 'sites', recordId: site.id, siteId: site.id, after: data });
      return site;
    }
    const before = await tx.site.findUnique({ where: { id } });
    ensure(before, 'Site tidak ditemukan.', 404);
    const site = await tx.site.update({ where: { id }, data });
    const d = diff(before, data);
    if (d.changed) await audit(tx, user, { action: 'UPDATE', module: 'sites', recordId: id, siteId: id, ...d });
    return site;
  });
}

export async function saveProject(user, siteId, body) {
  requireSite(user, siteId);
  object(body, ['id', 'name', 'owner', 'contractNo', 'startDate', 'endDate', 'status', 'notes']);
  const data = {
    name: text(body.name, 'Nama proyek', 200),
    owner: text(body.owner, 'Owner', 200),
    contractNo: text(body.contractNo, 'No kontrak', 80, true),
    startDate: optionalDate(body.startDate, 'Tanggal mulai'),
    endDate: optionalDate(body.endDate, 'Tanggal selesai'),
    status: choice(body.status ?? 'ACTIVE', ['ACTIVE', 'SELESAI', 'NONAKTIF']),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(!data.startDate || !data.endDate || data.endDate >= data.startDate, 'Tanggal selesai harus setelah tanggal mulai.');
  return prisma.$transaction(async (tx) => {
    if (body.id) {
      const before = await tx.project.findFirst({ where: { id: body.id, siteId } });
      ensure(before, 'Proyek tidak ditemukan.', 404);
      const row = await tx.project.update({ where: { id: body.id }, data });
      await audit(tx, user, { action: 'UPDATE', module: 'sites', recordId: row.id, siteId, ...diff(before, data) });
      return row;
    }
    const row = await tx.project.create({ data: { ...data, siteId } });
    await audit(tx, user, { action: 'CREATE', module: 'sites', recordId: row.id, siteId, after: data, note: 'Proyek baru' });
    return row;
  });
}

// Pergantian penanggung jawab menutup penanggung jawab lama sehingga riwayat tetap tersimpan.
export async function assignResponsible(user, siteId, body) {
  requireSite(user, siteId);
  object(body, ['role', 'name', 'phone', 'userId', 'startDate']);
  const role = choice(body.role, ['PJO', 'PM', 'HSE_SITE'], 'Peran');
  const startDate = date(body.startDate, 'Tanggal mulai');
  const data = { siteId, role, name: text(body.name, 'Nama', 120), phone: text(body.phone, 'Telepon', 30, true), userId: optionalId(body.userId), startDate };
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteResponsible.findMany({ where: { siteId, role, endDate: null } });
    for (const c of current) {
      ensure(startDate > c.startDate, 'Tanggal mulai harus setelah penanggung jawab sebelumnya mulai.');
      await tx.siteResponsible.update({ where: { id: c.id }, data: { endDate: addDays(startDate, -1) } });
    }
    const row = await tx.siteResponsible.create({ data });
    await audit(tx, user, { action: 'UPDATE', module: 'sites', recordId: siteId, siteId, before: { [role]: current.map((c) => c.name) }, after: { [role]: data.name }, note: 'Pergantian penanggung jawab' });
    return row;
  });
}
