import { prisma } from '../prisma.js';
import { canDecideMutation, siteFilter, siteScope } from '../access.js';
import { audit, actorName } from '../audit.js';
import { addDays, today } from '../dates.js';
import { nextNumber } from '../sequence.js';
import { choice, date, ensure, id, InputError, object, text } from '../validation.js';
import { requireSite, scopedPersonnel, siteExists } from './common.js';
import { logApproval, notify, notifyRoles } from './notify.js';

export const END_REASONS = ['MUTASI', 'DEMOBILISASI', 'RESIGN', 'DIRUMAHKAN', 'SELESAI_PROYEK', 'LAINNYA'];

export async function listPlacements(user, f, { skip = 0, take = 50 } = {}) {
  const where = { ...siteFilter(user, f.siteId), status: f.status === 'ENDED' ? 'ENDED' : f.status === 'all' ? undefined : 'ACTIVE' };
  if (f.q) where.personnel = { name: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } };
  if (f.personnelId) where.personnelId = f.personnelId;
  if (where.status === undefined) delete where.status;
  const scopeMut = siteScope(user);
  const mutationWhere = scopeMut === null ? {} : { OR: [{ toSiteId: { in: scopeMut } }, { fromSiteId: { in: scopeMut } }] };
  const [rows, total, mutations] = await Promise.all([
    prisma.placement.findMany({
      where, skip, take, orderBy: [{ startDate: 'desc' }],
      include: { personnel: { select: { id: true, code: true, name: true, category: true, workStatus: true } }, site: { select: { code: true, name: true } } },
    }),
    prisma.placement.count({ where }),
    prisma.mutation.findMany({
      where: { ...mutationWhere, ...(f.personnelId ? { personnelId: f.personnelId } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100,
      include: { personnel: { select: { id: true, code: true, name: true, position: true, currentSite: { select: { code: true } } } }, toSite: { select: { code: true, name: true } } },
    }),
  ]);
  return { rows, total, mutations };
}

export async function requestMutation(user, body) {
  object(body, ['personnelId', 'toSiteId', 'toPosition', 'effectiveDate', 'reason']);
  const person = await scopedPersonnel(user, id(body.personnelId, 'Personel'));
  const toSiteId = id(body.toSiteId, 'Site tujuan');
  ensure(!person.isFormer, 'Mantan personel tidak dapat dimutasi.');
  const data = {
    toSiteId,
    toPosition: text(body.toPosition ?? person.position, 'Jabatan tujuan', 100),
    effectiveDate: date(body.effectiveDate, 'Tanggal efektif'),
    reason: text(body.reason, 'Alasan', 1000),
  };
  return prisma.$transaction(async (tx) => {
    const site = await siteExists(tx, toSiteId);
    ensure(site.isActive, 'Site tujuan tidak aktif.');
    const active = await tx.placement.findFirst({ where: { personnelId: person.id, status: 'ACTIVE' } });
    ensure(active, 'Personel tidak memiliki penempatan aktif.');
    ensure(!(active.siteId === toSiteId && active.position === data.toPosition), 'Site dan jabatan tujuan sama dengan penempatan aktif.');
    ensure(data.effectiveDate > active.startDate, 'Tanggal efektif harus setelah tanggal mulai penempatan aktif.');
    const number = await nextNumber(tx, 'mutation-' + new Date().getUTCFullYear(), `MUT-${new Date().getUTCFullYear()}-`);
    const m = await tx.mutation.create({
      data: { ...data, number, personnelId: person.id, fromSiteId: active.siteId, requestedBy: user.id, requestedName: actorName(user) },
    });
    await logApproval(tx, user, { entityType: 'MUTATION', entityId: m.id, step: 'SUBMIT', decision: 'SUBMIT', note: data.reason });
    await audit(tx, user, { action: 'SUBMIT', module: 'placements', recordId: m.id, siteId: active.siteId, after: { number, person: person.code, ...data } });
    await notifyRoles(tx, ['HO_HSE'], null, {
      type: 'MUTATION', title: `Pengajuan mutasi ${number}`, body: `${person.name} → ${site.code} (${data.toPosition}) menunggu keputusan HO.`,
      link: '/approvals', severity: 'WARNING', dedupeKey: 'mutation-submit-' + m.id,
    });
    return m;
  });
}

export async function decideMutation(user, mutationId, body) {
  if (!canDecideMutation(user)) throw new InputError('Mutasi hanya disahkan HO HSE.', 403);
  object(body, ['decision', 'note']);
  const decision = choice(body.decision, ['APPROVE', 'REJECT'], 'Keputusan');
  const note = text(body.note, 'Catatan', 1000, decision === 'APPROVE');
  return prisma.$transaction(async (tx) => {
    const m = await tx.mutation.findUnique({ where: { id: mutationId }, include: { personnel: true, toSite: true } });
    ensure(m, 'Mutasi tidak ditemukan.', 404);
    ensure(m.status === 'PENDING', 'Mutasi sudah diputuskan.', 409);
    const decided = { decidedBy: user.id, decidedName: actorName(user), decidedAt: new Date(), decisionNote: note };
    if (decision === 'REJECT') {
      await tx.mutation.update({ where: { id: m.id }, data: { ...decided, status: 'REJECTED' } });
    } else {
      const active = await tx.placement.findFirst({ where: { personnelId: m.personnelId, status: 'ACTIVE' } });
      ensure(active, 'Penempatan aktif tidak ditemukan.');
      // Penempatan lama diakhiri (tidak ditimpa), penempatan baru diaktifkan.
      await tx.placement.update({ where: { id: active.id }, data: { status: 'ENDED', endDate: addDays(m.effectiveDate, -1), endReason: 'MUTASI', mutationId: m.id } });
      await tx.placement.create({
        data: { personnelId: m.personnelId, siteId: m.toSiteId, position: m.toPosition, startDate: m.effectiveDate, status: 'ACTIVE', mutationId: m.id, notes: `Mutasi ${m.number}`, createdBy: user.id },
      });
      await tx.personnel.update({ where: { id: m.personnelId }, data: { currentSiteId: m.toSiteId, position: m.toPosition, workStatus: m.effectiveDate > today() ? 'MUTASI' : m.personnel.workStatus === 'MUTASI' ? 'ACTIVE' : m.personnel.workStatus } });
      await tx.mutation.update({ where: { id: m.id }, data: { ...decided, status: 'APPROVED' } });
    }
    await logApproval(tx, user, { entityType: 'MUTATION', entityId: m.id, step: decision, decision, note });
    await audit(tx, user, { action: decision, module: 'placements', recordId: m.id, siteId: m.toSiteId, before: { status: 'PENDING' }, after: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', note } });
    await notify(tx, [m.requestedBy], {
      type: 'MUTATION', title: `Mutasi ${m.number} ${decision === 'APPROVE' ? 'disetujui' : 'ditolak'}`,
      body: `${m.personnel.name} → ${m.toSite.code}. ${note ?? ''}`, link: '/placements', dedupeKey: 'mutation-decision-' + m.id,
      severity: decision === 'APPROVE' ? 'INFO' : 'WARNING',
    });
    return { ok: true };
  });
}

export async function cancelMutation(user, mutationId) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.mutation.findUnique({ where: { id: mutationId } });
    ensure(m && m.status === 'PENDING', 'Mutasi tidak dapat dibatalkan.', 409);
    ensure(m.requestedBy === user.id || user.role === 'HO_HSE', 'Hanya pengaju atau HO HSE yang dapat membatalkan.', 403);
    await tx.mutation.update({ where: { id: m.id }, data: { status: 'CANCELLED', decidedName: actorName(user), decidedAt: new Date() } });
    await logApproval(tx, user, { entityType: 'MUTATION', entityId: m.id, step: 'CANCEL', decision: 'CANCEL' });
    await audit(tx, user, { action: 'UPDATE', module: 'placements', recordId: m.id, after: { status: 'CANCELLED' } });
    return { ok: true };
  });
}

/** Penempatan baru untuk personel tanpa penempatan aktif (mis. direkrut kembali). */
export async function createPlacement(user, body) {
  object(body, ['personnelId', 'siteId', 'position', 'startDate', 'notes']);
  ensure(['HO_HSE', 'HSE_SITE'].includes(user.role), 'Hanya HSE yang dapat membuat penempatan.', 403);
  const person = await prisma.personnel.findUnique({ where: { id: id(body.personnelId, 'Personel') } });
  ensure(person, 'Personel tidak ditemukan.', 404);
  const siteId = requireSite(user, body.siteId);
  // HSE Site boleh menempatkan ulang mantan personel ke sitenya; personel aktif di site lain hanya lewat mutasi.
  if (user.role !== 'HO_HSE' && person.currentSiteId && person.currentSiteId !== siteId && !person.isFormer) {
    throw new InputError('Personel aktif di site lain; gunakan pengajuan mutasi.', 403);
  }
  const data = { siteId, position: text(body.position ?? person.position, 'Jabatan', 100), startDate: date(body.startDate, 'Tanggal mulai'), notes: text(body.notes, 'Catatan', 500, true) };
  return prisma.$transaction(async (tx) => {
    const active = await tx.placement.findFirst({ where: { personnelId: person.id, status: 'ACTIVE' } });
    ensure(!active, 'Personel masih memiliki penempatan aktif; akhiri dulu atau ajukan mutasi.', 409);
    const row = await tx.placement.create({ data: { ...data, personnelId: person.id, status: 'ACTIVE', createdBy: user.id } });
    await tx.personnel.update({ where: { id: person.id }, data: { currentSiteId: siteId, position: data.position, isFormer: false, workStatus: 'ACTIVE' } });
    await audit(tx, user, { action: 'CREATE', module: 'placements', recordId: row.id, siteId, after: { person: person.code, ...data } });
    return row;
  });
}

export async function endPlacement(user, placementId, body, db = null) {
  object(body, ['endDate', 'endReason', 'notes', 'workStatus']);
  const run = async (tx) => {
    const p = await tx.placement.findUnique({ where: { id: placementId }, include: { personnel: true } });
    ensure(p && p.status === 'ACTIVE', 'Penempatan aktif tidak ditemukan.', 404);
    requireSite(user, p.siteId);
    const endDate = date(body.endDate, 'Tanggal akhir');
    ensure(endDate >= p.startDate, 'Tanggal akhir sebelum tanggal mulai.');
    const endReason = choice(body.endReason, END_REASONS, 'Alasan');
    const workStatus = body.workStatus ? choice(body.workStatus, ['RESIGN', 'DIRUMAHKAN', 'CUTI', 'ACTIVE', 'MUTASI'], 'Status kerja') : endReason === 'RESIGN' ? 'RESIGN' : endReason === 'DIRUMAHKAN' ? 'DIRUMAHKAN' : p.personnel.workStatus;
    await tx.placement.update({ where: { id: p.id }, data: { status: 'ENDED', endDate, endReason, notes: [p.notes, text(body.notes, 'Catatan', 500, true)].filter(Boolean).join(' · ') || null } });
    await tx.personnel.update({ where: { id: p.personnelId }, data: { workStatus, isFormer: workStatus === 'RESIGN' } });
    await audit(tx, user, { action: 'UPDATE', module: 'placements', recordId: p.id, siteId: p.siteId, before: { status: 'ACTIVE' }, after: { status: 'ENDED', endDate, endReason, workStatus } });
    return { ok: true };
  };
  return db ? run(db) : prisma.$transaction(run);
}
