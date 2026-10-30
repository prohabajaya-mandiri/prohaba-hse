import { prisma } from '../prisma.js';
import { siteScope } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays } from '../dates.js';
import { bool, choice, date, ensure, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { SITE_TIMEZONES } from '../dates.js';
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
  object(body, ['code', 'name', 'location', 'region', 'timezone', 'isHo', 'isActive']);
  const code = text(body.code, 'Kode site', 20).toUpperCase();
  ensure(/^[A-Z0-9-]+$/.test(code), 'Kode site hanya huruf, angka dan tanda minus.');
  return {
    code,
    name: text(body.name, 'Nama site', 120),
    location: text(body.location, 'Lokasi', 200, true),
    region: choice(body.region, ['TIMUR', 'BARAT', 'HO'], 'Wilayah'),
    timezone: optionalChoice(body.timezone, Object.keys(SITE_TIMEZONES), 'Zona waktu'),
    isHo: bool(body.isHo),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
}

export async function saveSite(user, id, body) {
  const data = parseSite(body);
  return prisma.$transaction(async (tx) => {
    const dup = await tx.site.findUnique({ where: { code: data.code }, select: { id: true, name: true } });
    ensure(!dup || dup.id === id, `Kode site ${data.code} sudah dipakai site ${dup?.name}.`, 409);
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

// Data yang merujuk site. Site yang sudah dipakai tidak boleh dihapus (riwayat & audit tetap utuh);
// cukup dinonaktifkan. Proyek & penanggung jawab adalah bagian dari master site, ikut terhapus.
const SITE_USAGE = {
  users: 'akses pengguna', personnel: 'personel (site saat ini)', initialStaff: 'personel (site awal)', placements: 'penempatan',
  mutationsTo: 'mutasi', mcus: 'MCU', permits: 'permit', mobilizations: 'mobilisasi', leaves: 'cuti/izin', rosterPolicies: 'pola roster',
  dailyPerf: 'kinerja harian', activities: 'aktivitas HSE', reports: 'laporan HSE', incidents: 'insiden', trainings: 'training', documents: 'dokumen HSE', registrations: 'pendaftaran pegawai', csmsApplications: 'penerapan CSMS', csmsFindings: 'temuan CSMS', csmsAssessments: 'assessment CSMS', workPermits: 'izin kerja khusus',
  hazardReports: 'hazard report', inspections: 'inspeksi/P2H', correctiveActions: 'tindakan korektif',
};

/** Hapus permanen hanya untuk site yang belum pernah dipakai (mis. salah input). */
export async function deleteSite(user, id) {
  return prisma.$transaction(async (tx) => {
    const site = await tx.site.findUnique({
      where: { id },
      include: { _count: { select: Object.fromEntries(Object.keys(SITE_USAGE).map((k) => [k, true])) }, projects: true, responsibles: true },
    });
    ensure(site, 'Site tidak ditemukan.', 404);
    const used = Object.entries(site._count).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${SITE_USAGE[k]}`);
    ensure(!used.length, `Site ${site.code} sudah dipakai (${used.join(', ')}) sehingga tidak dapat dihapus. Perbaiki nama lewat Edit site, atau nonaktifkan site agar riwayat tetap utuh.`, 409);
    await tx.project.deleteMany({ where: { siteId: id } });
    await tx.siteResponsible.deleteMany({ where: { siteId: id } });
    await tx.site.delete({ where: { id } });
    const { _count, ...before } = site;
    void _count;
    await audit(tx, user, { action: 'DELETE', module: 'sites', recordId: id, before, note: `Hapus site ${site.code} (belum pernah dipakai)` });
    return { id };
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

const RESPONSIBLE_ROLES = ['PJO', 'PM', 'HSE_SITE', 'SAFETY_OFFICER'];

const responsibleFields = (role, body) => ({
  name: text(body.name, 'Nama', 120), phone: text(body.phone, 'Telepon', 30, true), email: text(body.email, 'Email', 150, true),
  // Data pengesahan PJO untuk administrasi owner (008B).
  ...(role === 'PJO' ? { competency: text(body.competency, 'Kompetensi kepengawasan', 60, true), approvalNo: text(body.approvalNo, 'Nomor surat pengesahan', 100, true), approvalDate: optionalDate(body.approvalDate, 'Tanggal pengesahan') } : {}),
});

/** Penanggung jawab sebelumnya yang ditutup otomatis saat `row` ditambahkan (selesai sehari sebelum row mulai). */
const predecessorOf = (tx, row) => tx.siteResponsible.findFirst({
  where: { siteId: row.siteId, role: row.role, id: { not: row.id }, endDate: addDays(row.startDate, -1) },
});

async function loadResponsible(tx, user, siteId, respId) {
  requireSite(user, siteId);
  const row = await tx.siteResponsible.findFirst({ where: { id: respId, siteId } });
  ensure(row, 'Penanggung jawab tidak ditemukan.', 404);
  return row;
}

// Koreksi salah input. Peran tidak bisa diubah (pakai hapus lalu tambah); bila tanggal mulai digeser,
// tanggal selesai penanggung jawab sebelumnya ikut digeser agar riwayat tetap bersambung.
export async function updateResponsible(user, siteId, respId, body) {
  object(body, ['name', 'phone', 'email', 'competency', 'approvalNo', 'approvalDate', 'startDate', 'endDate']);
  return prisma.$transaction(async (tx) => {
    const before = await loadResponsible(tx, user, siteId, respId);
    const startDate = date(body.startDate, 'Tanggal mulai');
    const endDate = before.endDate ? date(body.endDate, 'Tanggal selesai') : null;
    ensure(!endDate || endDate >= startDate, 'Tanggal selesai harus sama atau setelah tanggal mulai.');
    const data = { ...responsibleFields(before.role, body), startDate, endDate };
    if (+startDate !== +before.startDate) {
      const prev = await predecessorOf(tx, before);
      if (prev) {
        ensure(startDate > prev.startDate, `Tanggal mulai harus setelah ${prev.name} mulai.`);
        await tx.siteResponsible.update({ where: { id: prev.id }, data: { endDate: addDays(startDate, -1) } });
      }
    }
    const row = await tx.siteResponsible.update({ where: { id: respId }, data });
    const d = diff(before, data);
    if (d.changed) await audit(tx, user, { action: 'UPDATE', module: 'sites', recordId: siteId, siteId, ...d, note: `Koreksi penanggung jawab ${before.role} ${before.name}` });
    return row;
  });
}

// Hapus entri salah input. Bila yang dihapus masih aktif, penanggung jawab yang tadinya ditutup
// otomatis olehnya diaktifkan kembali.
export async function deleteResponsible(user, siteId, respId) {
  return prisma.$transaction(async (tx) => {
    const row = await loadResponsible(tx, user, siteId, respId);
    const prev = row.endDate ? null : await predecessorOf(tx, row);
    if (prev) await tx.siteResponsible.update({ where: { id: prev.id }, data: { endDate: null } });
    await tx.siteResponsible.delete({ where: { id: respId } });
    await audit(tx, user, { action: 'DELETE', module: 'sites', recordId: siteId, siteId, before: row, note: `Hapus penanggung jawab ${row.role} ${row.name}${prev ? `; ${prev.name} aktif kembali` : ''}` });
    return { id: respId, reactivated: prev?.name ?? null };
  });
}

// Pergantian penanggung jawab menutup penanggung jawab lama sehingga riwayat tetap tersimpan.
export async function assignResponsible(user, siteId, body) {
  requireSite(user, siteId);
  object(body, ['role', 'name', 'phone', 'email', 'competency', 'approvalNo', 'approvalDate', 'userId', 'startDate']);
  const role = choice(body.role, RESPONSIBLE_ROLES, 'Peran');
  const startDate = date(body.startDate, 'Tanggal mulai');
  const data = { siteId, role, userId: optionalId(body.userId), startDate, ...responsibleFields(role, body) };
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
