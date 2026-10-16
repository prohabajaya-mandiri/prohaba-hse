import { prisma } from '../prisma.js';
import { siteFilter } from '../access.js';
import { audit, diff } from '../audit.js';
import { addDays, today } from '../dates.js';
import { cycleStart, LEAVE_TYPES, nextLeaveDue, pickPolicy, rosterState } from '../domain/roster.js';
import { CATEGORIES } from '../domain/personnel.js';
import { getSetting } from '../settings.js';
import { bool, choice, date, ensure, id, InputError, int, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { requireSite, scopedPersonnel } from './common.js';

// Status kerja mengikuti jenis cuti yang sedang berjalan (SAKIT ≠ CUTI).
const STATUS_FOR = { CUTI: 'CUTI', OFF_ROSTER: 'CUTI', SAKIT: 'SAKIT', IZIN: 'CUTI' };

export const listPolicies = () => prisma.rosterPolicy.findMany({ include: { site: { select: { code: true } } }, orderBy: [{ siteId: 'asc' }, { category: 'asc' }] });

export async function savePolicy(user, policyId, body) {
  ensure(user.role === 'HO_HSE', 'Pola roster diatur HO HSE.', 403);
  object(body, ['name', 'siteId', 'category', 'maritalStatus', 'onsiteDays', 'offDays', 'countWorkdays', 'notes', 'isActive']);
  const data = {
    name: text(body.name, 'Nama pola', 120),
    siteId: optionalId(body.siteId, 'Site'),
    category: choice(body.category, CATEGORIES, 'Kategori'),
    maritalStatus: optionalChoice(body.maritalStatus, ['MENIKAH', 'BELUM_MENIKAH'], 'Status nikah'),
    onsiteDays: int(body.onsiteDays, 'Hari onsite', 1, 400),
    offDays: int(body.offDays, 'Hari off', 1, 120),
    countWorkdays: bool(body.countWorkdays),
    notes: text(body.notes, 'Catatan', 500, true),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  return prisma.$transaction(async (tx) => {
    if (policyId) {
      const before = await tx.rosterPolicy.findUnique({ where: { id: policyId } });
      ensure(before, 'Pola tidak ditemukan.', 404);
      const row = await tx.rosterPolicy.update({ where: { id: policyId }, data });
      await audit(tx, user, { action: 'UPDATE', module: 'roster', recordId: policyId, siteId: data.siteId, ...diff(before, data) });
      return row;
    }
    const row = await tx.rosterPolicy.create({ data });
    await audit(tx, user, { action: 'CREATE', module: 'roster', recordId: row.id, siteId: data.siteId, after: data });
    return row;
  });
}

/** Papan roster: penempatan aktif + pola + jadwal cuti berikutnya. */
export async function rosterBoard(user, f) {
  const now = today();
  const threshold = (await getSetting('reminder.thresholds')).roster;
  const where = { status: 'ACTIVE', ...siteFilter(user, f.siteId) };
  if (f.category) where.personnel = { category: f.category };
  if (f.q) where.personnel = { ...(where.personnel ?? {}), name: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } };
  const [placements, policies] = await Promise.all([
    prisma.placement.findMany({
      where, take: 500, orderBy: { personnel: { name: 'asc' } },
      include: {
        site: { select: { code: true } },
        personnel: {
          select: {
            id: true, code: true, name: true, category: true, maritalStatus: true, position: true, workStatus: true,
            leaves: { where: { status: { not: 'BATAL' } }, orderBy: { startDate: 'desc' }, take: 10 },
          },
        },
      },
    }),
    prisma.rosterPolicy.findMany({ where: { isActive: true } }),
  ]);
  const rows = placements.map((pl) => {
    const p = pl.personnel;
    const policy = pickPolicy(policies, { siteId: pl.siteId, category: p.category, maritalStatus: p.maritalStatus });
    const ongoing = p.leaves.find((l) => l.status === 'BERJALAN');
    const planned = p.leaves.filter((l) => l.status === 'RENCANA').sort((a, b) => a.startDate - b.startDate)[0] ?? null;
    const start = cycleStart(pl.startDate, p.leaves.filter((l) => l.status === 'SELESAI'));
    const due = nextLeaveDue(policy, start);
    const state = ongoing ? { state: 'SEDANG_CUTI', left: null } : rosterState(due, now, threshold);
    return {
      placementId: pl.id, siteId: pl.siteId, siteCode: pl.site.code, personnel: { id: p.id, code: p.code, name: p.name, category: p.category, position: p.position, workStatus: p.workStatus },
      policy: policy ? { name: policy.name, onsiteDays: policy.onsiteDays, offDays: policy.offDays, countWorkdays: policy.countWorkdays } : null,
      cycleStart: start, due, backDue: due && policy ? addDays(due, policy.offDays) : null, ongoing, planned, ...state,
    };
  });
  const filtered = f.state ? rows.filter((r) => r.state === f.state) : rows;
  return { rows: filtered, threshold, counts: rows.reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {}) };
}

export async function listLeaves(user, f, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId) };
  if (f.type && LEAVE_TYPES.includes(f.type)) where.type = f.type;
  if (f.personnelId) where.personnelId = f.personnelId;
  if (f.status) where.status = f.status;
  const [rows, total] = await Promise.all([
    prisma.leaveRecord.findMany({ where, skip, take, orderBy: { startDate: 'desc' }, include: { personnel: { select: { id: true, name: true, code: true } }, site: { select: { code: true } } } }),
    prisma.leaveRecord.count({ where }),
  ]);
  return { rows, total };
}

export async function createLeave(user, body) {
  object(body, ['personnelId', 'type', 'startDate', 'endDate', 'reason']);
  const person = await scopedPersonnel(user, id(body.personnelId, 'Personel'));
  const siteId = requireSite(user, person.currentSiteId);
  const v = { type: choice(body.type, LEAVE_TYPES, 'Jenis'), startDate: date(body.startDate, 'Mulai'), endDate: date(body.endDate, 'Selesai'), reason: text(body.reason, 'Keterangan', 500, true) };
  ensure(v.endDate >= v.startDate, 'Tanggal selesai sebelum tanggal mulai.');
  const now = today();
  const status = v.startDate <= now && v.endDate >= now ? 'BERJALAN' : v.endDate < now ? 'SELESAI' : 'RENCANA';
  return prisma.$transaction(async (tx) => {
    const overlap = await tx.leaveRecord.findFirst({ where: { personnelId: person.id, status: { in: ['RENCANA', 'BERJALAN'] }, startDate: { lte: v.endDate }, endDate: { gte: v.startDate } } });
    ensure(!overlap, 'Periode bertumpuk dengan cuti/izin lain.', 409);
    const row = await tx.leaveRecord.create({ data: { ...v, status, returnDate: status === 'SELESAI' ? addDays(v.endDate, 1) : null, personnelId: person.id, siteId, createdBy: user.id } });
    if (status === 'BERJALAN') await tx.personnel.update({ where: { id: person.id }, data: { workStatus: STATUS_FOR[v.type] } });
    await audit(tx, user, { action: 'CREATE', module: 'roster', recordId: row.id, siteId, after: { person: person.code, ...v, status } });
    return row;
  });
}

// Mulai / kembali / batal / ubah jadwal — setiap perubahan tercatat (riwayat tidak ditimpa).
export async function updateLeave(user, leaveId, body) {
  object(body, ['action', 'returnDate', 'startDate', 'endDate', 'reason']);
  const action = choice(body.action, ['START', 'RETURN', 'CANCEL', 'RESCHEDULE'], 'Aksi');
  return prisma.$transaction(async (tx) => {
    const l = await tx.leaveRecord.findUnique({ where: { id: leaveId }, include: { personnel: { select: { workStatus: true } } } });
    ensure(l, 'Data tidak ditemukan.', 404);
    requireSite(user, l.siteId);
    let data;
    if (action === 'START') {
      ensure(l.status === 'RENCANA', 'Hanya rencana yang dapat dimulai.', 409);
      data = { status: 'BERJALAN' };
      await tx.personnel.update({ where: { id: l.personnelId }, data: { workStatus: STATUS_FOR[l.type] } });
    } else if (action === 'RETURN') {
      ensure(['BERJALAN', 'RENCANA'].includes(l.status), 'Status tidak valid.', 409);
      const returnDate = date(body.returnDate, 'Tanggal kembali');
      ensure(returnDate >= l.startDate, 'Tanggal kembali sebelum mulai cuti.');
      data = { status: 'SELESAI', returnDate };
      if (['CUTI', 'SAKIT'].includes(l.personnel.workStatus)) await tx.personnel.update({ where: { id: l.personnelId }, data: { workStatus: 'ACTIVE' } });
    } else if (action === 'CANCEL') {
      ensure(l.status === 'RENCANA', 'Hanya rencana yang dapat dibatalkan.', 409);
      data = { status: 'BATAL' };
    } else {
      ensure(['RENCANA', 'BERJALAN'].includes(l.status), 'Status tidak valid.', 409);
      data = { startDate: optionalDate(body.startDate) ?? l.startDate, endDate: date(body.endDate, 'Selesai'), reason: text(body.reason, 'Alasan perubahan', 500) };
      ensure(data.endDate >= data.startDate, 'Tanggal selesai sebelum mulai.');
    }
    const row = await tx.leaveRecord.update({ where: { id: leaveId }, data });
    await audit(tx, user, { action: 'UPDATE', module: 'roster', recordId: leaveId, siteId: l.siteId, ...diff(l, data), note: action });
    return row;
  });
}

export function assertPolicyEditor(user) {
  if (user.role !== 'HO_HSE') throw new InputError('Pola roster diatur HO HSE.', 403);
}
