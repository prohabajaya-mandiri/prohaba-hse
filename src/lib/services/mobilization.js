import { prisma } from '../prisma.js';
import { canSeeSite, siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { today } from '../dates.js';
import { fitness } from '../domain/mcu.js';
import { permitStatus } from '../domain/permit.js';
import { nextNumber } from '../sequence.js';
import { getSetting } from '../settings.js';
import { array, bool, choice, date, ensure, id, InputError, object, optionalDate, optionalNumber, text } from '../validation.js';
import { requireSite } from './common.js';
import { endPlacement } from './placements.js';

export const MOB_STATUSES = ['DIRENCANAKAN', 'MENUNGGU_PERSYARATAN', 'SIAP', 'PERJALANAN', 'TIBA', 'SELESAI', 'BATAL'];
const FLOW = {
  DIRENCANAKAN: ['MENUNGGU_PERSYARATAN', 'SIAP', 'BATAL'],
  MENUNGGU_PERSYARATAN: ['SIAP', 'DIRENCANAKAN', 'BATAL'],
  SIAP: ['PERJALANAN', 'MENUNGGU_PERSYARATAN', 'BATAL'],
  PERJALANAN: ['TIBA'],
  TIBA: ['SELESAI'],
  SELESAI: [],
  BATAL: [],
};
const LOCKED = ['PERJALANAN', 'TIBA', 'SELESAI', 'BATAL'];

/** Pemeriksaan MCU & permit setiap anggota sebelum keberangkatan. */
export async function readiness(db, mobilization, members) {
  const now = today();
  const threshold = (await getSetting('reminder.thresholds', db)).permit;
  const ids = members.map((m) => m.personnelId);
  const [people, mcus, permits] = await Promise.all([
    db.personnel.findMany({ where: { id: { in: ids } }, select: { id: true, currentSiteId: true } }),
    db.mcuRecord.findMany({ where: { personnelId: { in: ids }, isLatest: true }, select: { personnelId: true, result: true, validUntil: true, fuDueDate: true } }),
    db.permit.findMany({ where: { personnelId: { in: ids }, siteId: mobilization.siteId, revokedAt: null }, orderBy: { endDate: 'desc' } }),
  ]);
  return Object.fromEntries(ids.map((pid) => {
    const fit = fitness(mcus.find((m) => m.personnelId === pid), now);
    const permit = permits.find((p) => p.personnelId === pid);
    const pStatus = permit ? permitStatus(permit, mobilization.departDate ?? now, threshold) : 'TIDAK_ADA';
    const issues = [];
    if (mobilization.type === 'MOBILISASI') {
      if (!['FIT', 'FOLLOW_UP'].includes(fit)) issues.push('MCU: ' + fit.replace(/_/g, ' '));
      if (!['AKTIF', 'AKAN_HABIS', 'BELUM_BERLAKU'].includes(pStatus)) issues.push('Permit site: ' + pStatus.replace(/_/g, ' '));
      if (people.find((p) => p.id === pid)?.currentSiteId !== mobilization.siteId) issues.push('Penempatan aktif bukan di site tujuan (ajukan mutasi)');
    }
    return [pid, { fitness: fit, permit: pStatus, permitEnd: permit?.endDate ?? null, ready: issues.length === 0, issues }];
  }));
}

export async function listMobilizations(user, f, { skip = 0, take = 30 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  if (f.type) where.type = choice(f.type, ['MOBILISASI', 'DEMOBILISASI'], 'Jenis');
  if (f.status && MOB_STATUSES.includes(f.status)) where.status = f.status;
  const [rows, total] = await Promise.all([
    prisma.mobilization.findMany({
      where, skip, take, orderBy: [{ departDate: 'desc' }],
      include: { site: { select: { code: true, name: true } }, members: { include: { personnel: { select: { id: true, code: true, name: true, position: true, workStatus: true } } } } },
    }),
    prisma.mobilization.count({ where }),
  ]);
  const withCheck = [];
  for (const m of rows) withCheck.push({ ...m, check: ['DIRENCANAKAN', 'MENUNGGU_PERSYARATAN', 'SIAP'].includes(m.status) ? await readiness(prisma, m, m.members) : {} });
  return { rows: withCheck, total };
}

function parse(body) {
  return {
    type: choice(body.type, ['MOBILISASI', 'DEMOBILISASI'], 'Jenis'),
    origin: text(body.origin, 'Asal', 150),
    destination: text(body.destination, 'Tujuan', 150),
    departDate: date(body.departDate, 'Tanggal berangkat'),
    arriveDate: optionalDate(body.arriveDate, 'Estimasi tiba'),
    transport: text(body.transport, 'Transportasi', 200, true),
    cost: optionalNumber(body.cost, 'Biaya', 0, 1e11),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
}

export async function createMobilization(user, body) {
  object(body, ['type', 'siteId', 'origin', 'destination', 'departDate', 'arriveDate', 'transport', 'cost', 'notes', 'personnelIds', 'demobReason', 'nextStatus']);
  const siteId = requireSite(user, body.siteId);
  const v = parse(body);
  const personnelIds = [...new Set(array(body.personnelIds, 'Personel', 200))];
  return prisma.$transaction(async (tx) => {
    const people = await tx.personnel.findMany({ where: { id: { in: personnelIds } }, select: { id: true, currentSiteId: true, isFormer: true } });
    ensure(people.length === personnelIds.length, 'Sebagian personel tidak ditemukan.');
    ensure(people.every((p) => canSeeSite(user, p.currentSiteId)), 'Sebagian personel di luar cakupan site Anda.', 403);
    // Demobilisasi hanya untuk personel di site tersebut; mobilisasi tujuan site dalam cakupan pengguna.
    if (v.type === 'DEMOBILISASI') ensure(people.every((p) => p.currentSiteId === siteId), 'Demobilisasi hanya untuk personel yang ditempatkan di site ini.');
    const code = await nextNumber(tx, 'kloter-' + v.departDate.getUTCFullYear(), `${v.type === 'MOBILISASI' ? 'MOB' : 'DMB'}-${v.departDate.getUTCFullYear()}-`);
    const m = await tx.mobilization.create({
      data: {
        ...v, code, siteId, createdBy: user.id,
        members: { create: personnelIds.map((personnelId) => ({ personnelId, demobReason: v.type === 'DEMOBILISASI' ? text(body.demobReason, 'Alasan demobilisasi', 300) : null, nextStatus: v.type === 'DEMOBILISASI' ? choice(body.nextStatus ?? 'CUTI', ['CUTI', 'DIRUMAHKAN', 'RESIGN', 'MUTASI'], 'Status berikutnya') : null })) },
      },
      include: { members: true },
    });
    const check = await readiness(tx, m, m.members);
    if (v.type === 'MOBILISASI' && Object.values(check).some((c) => !c.ready)) await tx.mobilization.update({ where: { id: m.id }, data: { status: 'MENUNGGU_PERSYARATAN' } });
    await audit(tx, user, { action: 'CREATE', module: 'mobilization', recordId: m.id, siteId, after: { code, ...v, members: personnelIds.length } });
    return { id: m.id, code };
  }, { timeout: 30000 });
}

export async function updateMobilization(user, mobId, body) {
  object(body, ['origin', 'destination', 'departDate', 'arriveDate', 'transport', 'cost', 'notes', 'type', 'addPersonnelIds', 'removeMemberIds']);
  return prisma.$transaction(async (tx) => {
    const m = await tx.mobilization.findUnique({ where: { id: mobId } });
    ensure(m, 'Kloter tidak ditemukan.', 404);
    requireSite(user, m.siteId);
    ensure(!LOCKED.includes(m.status), 'Kloter sudah berangkat/selesai; data tidak dapat diubah.', 409);
    const v = parse({ ...body, type: m.type });
    await tx.mobilization.update({ where: { id: mobId }, data: v });
    const adds = (body.addPersonnelIds ?? []).map((x) => id(x));
    const addPeople = await tx.personnel.findMany({ where: { id: { in: adds } }, select: { currentSiteId: true } });
    ensure(addPeople.length === adds.length && addPeople.every((p) => canSeeSite(user, p.currentSiteId)), 'Personel tidak valid atau di luar cakupan.', 403);
    for (const pid of adds) await tx.mobilizationMember.upsert({ where: { mobilizationId_personnelId: { mobilizationId: mobId, personnelId: id(pid) } }, create: { mobilizationId: mobId, personnelId: pid }, update: {} });
    if (body.removeMemberIds?.length) await tx.mobilizationMember.deleteMany({ where: { mobilizationId: mobId, id: { in: body.removeMemberIds.map((x) => id(x)) } } });
    await audit(tx, user, { action: 'UPDATE', module: 'mobilization', recordId: mobId, siteId: m.siteId, ...diff(m, v) });
    return { ok: true };
  });
}

export async function setMobilizationStatus(user, mobId, body) {
  object(body, ['status', 'override', 'note']);
  const status = choice(body.status, MOB_STATUSES, 'Status');
  return prisma.$transaction(async (tx) => {
    const m = await tx.mobilization.findUnique({ where: { id: mobId }, include: { members: true } });
    ensure(m, 'Kloter tidak ditemukan.', 404);
    requireSite(user, m.siteId);
    ensure(FLOW[m.status].includes(status), `Status tidak dapat berubah dari ${m.status} ke ${status}.`, 409);
    ensure(m.members.length > 0 || status === 'BATAL', 'Kloter belum memiliki anggota.');
    if (['SIAP', 'PERJALANAN'].includes(status) && m.type === 'MOBILISASI') {
      const check = await readiness(tx, m, m.members);
      const blocked = Object.values(check).filter((c) => !c.ready).length;
      // Persyaratan belum lengkap hanya dapat dilewati HO HSE dengan alasan tercatat.
      if (blocked && !(user.role === 'HO_HSE' && bool(body.override) && body.note)) {
        throw new InputError(`${blocked} personel belum memenuhi persyaratan MCU/permit. ${user.role === 'HO_HSE' ? 'Isi alasan untuk melanjutkan.' : 'Hubungi HO HSE.'}`, 422);
      }
    }
    await tx.mobilization.update({ where: { id: mobId }, data: { status, ...(status === 'TIBA' && !m.arriveDate ? { arriveDate: today() } : {}) } });
    if (status === 'TIBA') await tx.mobilizationMember.updateMany({ where: { mobilizationId: mobId, arrived: false }, data: { arrived: true, arrivedAt: today() } });
    if (status === 'SELESAI') await completeMembers(tx, user, m);
    await audit(tx, user, { action: 'UPDATE', module: 'mobilization', recordId: mobId, siteId: m.siteId, before: { status: m.status }, after: { status }, note: body.note ? text(body.note, 'Catatan', 500) : null });
    return { ok: true };
  }, { timeout: 30000 });
}

// Mobilisasi selesai → personel aktif di site; demobilisasi selesai → penempatan diakhiri, riwayat tersimpan.
async function completeMembers(tx, user, m) {
  for (const member of m.members) {
    const placement = await tx.placement.findFirst({ where: { personnelId: member.personnelId, status: 'ACTIVE' } });
    if (m.type === 'MOBILISASI') {
      await tx.personnel.update({ where: { id: member.personnelId }, data: { workStatus: 'ACTIVE' } });
    } else if (placement && member.nextStatus !== 'MUTASI') {
      await endPlacement(user, placement.id, { endDate: (m.arriveDate ?? m.departDate).toISOString().slice(0, 10), endReason: member.nextStatus === 'RESIGN' ? 'RESIGN' : member.nextStatus === 'DIRUMAHKAN' ? 'DIRUMAHKAN' : 'DEMOBILISASI', notes: `Demobilisasi ${m.code}: ${member.demobReason ?? ''}`, workStatus: member.nextStatus ?? 'CUTI' }, tx);
    }
  }
}

export async function confirmArrival(user, memberId, body) {
  object(body, ['arrivedAt', 'notes']);
  return prisma.$transaction(async (tx) => {
    const member = await tx.mobilizationMember.findUnique({ where: { id: memberId }, include: { mobilization: true } });
    ensure(member, 'Anggota tidak ditemukan.', 404);
    requireSite(user, member.mobilization.siteId);
    ensure(['PERJALANAN', 'TIBA'].includes(member.mobilization.status), 'Konfirmasi tiba hanya saat perjalanan.', 409);
    await tx.mobilizationMember.update({ where: { id: memberId }, data: { arrived: true, arrivedAt: date(body.arrivedAt ?? today().toISOString().slice(0, 10)), notes: text(body.notes, 'Catatan', 300, true) } });
    const left = await tx.mobilizationMember.count({ where: { mobilizationId: member.mobilizationId, arrived: false } });
    if (!left) await tx.mobilization.update({ where: { id: member.mobilizationId }, data: { status: 'TIBA', arriveDate: today() } });
    await audit(tx, user, { action: 'UPDATE', module: 'mobilization', recordId: member.mobilizationId, siteId: member.mobilization.siteId, note: 'Konfirmasi tiba personel ' + member.personnelId });
    return { ok: true };
  });
}
