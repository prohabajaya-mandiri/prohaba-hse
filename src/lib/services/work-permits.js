// Register izin kerja khusus dari owner (aktivitas berisiko), terpisah dari Permit & SKS personel.
import { prisma } from '../prisma.js';
import { canAccess, canSeeSite, siteFilter } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { iso } from '../dates.js';
import { WORK_PERMIT_STATUSES, workPermitStatus, workPermitTransition } from '../domain/work-permit.js';
import { getSetting } from '../settings.js';
import { choice, ensure, id as idOf, InputError, object, optionalId, text } from '../validation.js';
import { attachFiles, filesOf } from './common.js';
import { visibleDocumentWhere } from './documents.js';

const ENTITY = 'WORK_PERMIT';
export const FILE_LABELS = { IZIN: 'Salinan izin owner', HIRADC: 'HIRADC / JSA', PENUTUPAN: 'Bukti penutupan', LAINNYA: 'Lampiran lain' };

function assertWrite(user, siteId) {
  if (!['HO_HSE', 'HSE_SITE'].includes(user.role) || !canSeeSite(user, siteId)) throw new InputError('Anda tidak dapat mengubah izin kerja site ini.', 403);
}

/** Jenis izin per owner (parameter workPermit.types): daftar owner khusus, selain itu daftar umum. */
export async function permitTypes(ownerName) {
  const cfg = await getSetting('workPermit.types');
  return (ownerName && cfg?.byOwner?.[ownerName]) || cfg?.default || [];
}

const dateTime = (v, name) => {
  ensure(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v), `${name} harus tanggal & jam.`);
  // Input datetime-local tanpa zona dianggap waktu site WIB/WITA/WIT; disimpan sebagai waktu UTC dari klien.
  const d = new Date(v);
  ensure(Number.isFinite(d.getTime()), `${name} tidak valid.`);
  return d;
};

export async function listWorkPermits(user, f = {}, { skip = 0, take = 50 } = {}) {
  const now = new Date();
  const where = { ...siteFilter(user, f.siteId) };
  if (f.status === 'BERAKHIR') Object.assign(where, { status: 'AKTIF', endAt: { lt: now } });
  else if (f.status === 'AKTIF') Object.assign(where, { status: 'AKTIF', endAt: { gte: now } });
  else if (WORK_PERMIT_STATUSES.includes(f.status)) where.status = f.status;
  if (f.type) where.permitType = String(f.type).slice(0, 100);
  if (f.q) where.OR = [{ number: { contains: String(f.q).slice(0, 60), mode: 'insensitive' } }, { workType: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }, { location: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }];
  const [rows, total] = await Promise.all([
    prisma.workPermit.findMany({ where, skip, take, orderBy: { startAt: 'desc' }, include: { site: { select: { code: true, name: true, timezone: true } } } }),
    prisma.workPermit.count({ where }),
  ]);
  const files = await filesOf(ENTITY, rows.map((r) => r.id));
  const projects = Object.fromEntries((await prisma.project.findMany({ where: { id: { in: rows.map((r) => r.projectId).filter(Boolean) } }, select: { id: true, name: true, owner: true } })).map((p) => [p.id, p]));
  const docs = Object.fromEntries((await prisma.hseDocument.findMany({ where: { id: { in: rows.map((r) => r.hiradcDocumentId).filter(Boolean) } }, select: { id: true, number: true, title: true, revision: true } })).map((d) => [d.id, d]));
  return {
    total,
    rows: rows.map((r) => ({
      ...r, displayStatus: workPermitStatus(r, now), project: projects[r.projectId] ?? null, hiradc: docs[r.hiradcDocumentId] ?? null,
      files: files.filter((x) => x.entityId === r.id), canEdit: ['HO_HSE', 'HSE_SITE'].includes(user.role) && canSeeSite(user, r.siteId),
    })),
  };
}

const FIELDS = ['siteId', 'projectId', 'number', 'permitType', 'workType', 'location', 'responsibleName', 'issuer', 'startAt', 'endAt', 'hiradcDocumentId', 'jsaNote'];

async function parse(tx, user, siteId, body) {
  const v = {
    projectId: optionalId(body.projectId, 'Proyek'),
    number: text(body.number, 'Nomor izin owner', 80),
    permitType: text(body.permitType, 'Jenis izin', 100),
    workType: text(body.workType, 'Jenis pekerjaan', 300),
    location: text(body.location, 'Lokasi', 300),
    responsibleName: text(body.responsibleName, 'Penanggung jawab', 150),
    issuer: text(body.issuer, 'Penerbit / otoritas owner', 150),
    startAt: dateTime(body.startAt, 'Waktu mulai'),
    endAt: dateTime(body.endAt, 'Waktu berakhir'),
    hiradcDocumentId: optionalId(body.hiradcDocumentId, 'Dokumen HIRADC/JSA'),
    jsaNote: text(body.jsaNote, 'Catatan HIRADC/JSA', 1000, true),
  };
  ensure(v.endAt > v.startAt, 'Waktu berakhir harus setelah waktu mulai.');
  let owner = null;
  if (v.projectId) {
    const p = await tx.project.findFirst({ where: { id: v.projectId, siteId } });
    ensure(p, 'Proyek bukan milik site ini.');
    owner = p.owner;
  }
  // Jenis izin mengikuti daftar owner bila diatur; selain itu daftar umum.
  const types = await permitTypes(owner);
  ensure(!types.length || types.includes(v.permitType), `Jenis izin tidak terdaftar untuk owner ini (pilihan: ${types.join(', ')}).`);
  if (v.hiradcDocumentId) ensure(await tx.hseDocument.findFirst({ where: { AND: [{ id: v.hiradcDocumentId }, visibleDocumentWhere(user), { OR: [{ siteId: null }, { siteId }] }] } }), 'Dokumen HIRADC/JSA tidak ditemukan.');
  return v;
}

export async function saveWorkPermit(user, id, body) {
  object(body, FIELDS);
  return prisma.$transaction(async (tx) => {
    if (!id) {
      const siteId = idOf(body.siteId, 'Site');
      assertWrite(user, siteId);
      const v = await parse(tx, user, siteId, body);
      ensure(!(await tx.workPermit.findFirst({ where: { siteId, number: v.number } })), `Nomor izin ${v.number} sudah tercatat di site ini.`, 409);
      const row = await tx.workPermit.create({ data: { ...v, siteId, createdById: user.id, createdByName: actorName(user) } });
      await audit(tx, user, { action: 'CREATE', module: 'work-permits', recordId: row.id, siteId, after: v, note: 'Catat izin kerja khusus' });
      return row;
    }
    const before = await tx.workPermit.findUnique({ where: { id } });
    ensure(before, 'Izin tidak ditemukan.', 404);
    assertWrite(user, before.siteId);
    ensure(before.status === 'TERCATAT', 'Izin yang sudah aktif/ditutup/dibatalkan tidak dapat diubah.', 409);
    const v = await parse(tx, user, before.siteId, body);
    const row = await tx.workPermit.update({ where: { id }, data: v });
    const d = diff(before, v);
    if (d.changed) await audit(tx, user, { action: 'UPDATE', module: 'work-permits', recordId: id, siteId: before.siteId, ...d });
    return row;
  }, { timeout: 20000 });
}

export async function workPermitAction(user, id, body) {
  object(body, ['action', 'note']);
  const action = choice(body.action, ['ACTIVATE', 'CLOSE', 'CANCEL'], 'Aksi');
  const note = text(body.note, 'Catatan', 1000, true);
  return prisma.$transaction(async (tx) => {
    const p = await tx.workPermit.findUnique({ where: { id } });
    ensure(p, 'Izin tidak ditemukan.', 404);
    assertWrite(user, p.siteId);
    const rule = workPermitTransition(user.role, action, p.status);
    if (!rule) throw new InputError(`Aksi tidak tersedia pada status ${p.status}.`, 409);
    const files = await tx.fileObject.findMany({ where: { entityType: ENTITY, entityId: id }, select: { label: true } });
    const data = { status: rule.to };
    if (action === 'ACTIVATE') {
      // Aplikasi tidak menerbitkan izin: aktif hanya merekam izin sah yang diterbitkan owner.
      ensure(files.some((f) => f.label === 'IZIN'), 'Lampirkan salinan izin yang diterbitkan owner sebelum menandai aktif.');
    }
    if (action === 'CLOSE') {
      ensure(files.some((f) => f.label === 'PENUTUPAN') || note, 'Lampirkan bukti penutupan atau isi catatan penutupan.');
      Object.assign(data, { closedAt: new Date(), closureNote: note });
    }
    if (action === 'CANCEL') {
      ensure(note, 'Alasan pembatalan wajib diisi.');
      data.cancelReason = note;
    }
    const row = await tx.workPermit.update({ where: { id }, data });
    await audit(tx, user, { action: action === 'CANCEL' ? 'REJECT' : 'UPDATE', module: 'work-permits', recordId: id, siteId: p.siteId, before: { status: p.status }, after: { status: rule.to }, note: `Izin ${p.number}: ${action}${note ? ' — ' + note : ''}` });
    return row;
  }, { timeout: 20000 });
}

export async function uploadWorkPermitFiles(user, id, label, files) {
  const lbl = choice(label, Object.keys(FILE_LABELS), 'Jenis lampiran');
  return prisma.$transaction(async (tx) => {
    const p = await tx.workPermit.findUnique({ where: { id } });
    ensure(p, 'Izin tidak ditemukan.', 404);
    assertWrite(user, p.siteId);
    ensure(!['DITUTUP', 'DIBATALKAN'].includes(p.status), 'Izin sudah ditutup/dibatalkan.', 409);
    const rows = await attachFiles(tx, user, files, { entityType: ENTITY, entityId: id, siteId: p.siteId, label: lbl });
    ensure(rows.length, 'Pilih file.');
    await audit(tx, user, { action: 'UPDATE', module: 'work-permits', recordId: id, siteId: p.siteId, after: { files: rows.map((r) => r.fileName), label: lbl }, note: `Lampiran izin ${p.number}` });
    return { files: rows };
  }, { timeout: 30000 });
}

export const canReadWorkPermitFile = (user, row) => canAccess(user.role, '/work-permits') && canSeeSite(user, row.siteId);

/** Izin aktif yang sudah lewat waktu berakhir tetapi belum ditutup (pengingat penutupan). */
export async function workPermitReminders(push) {
  const rows = await prisma.workPermit.findMany({ where: { status: 'AKTIF', endAt: { lt: new Date() } }, select: { id: true, siteId: true, number: true, permitType: true, endAt: true } });
  for (const p of rows) {
    await push(['HSE_SITE'], p.siteId, {
      type: 'CSMS', title: `Izin kerja ${p.number} berakhir — belum ditutup`, body: `${p.permitType} berakhir ${iso(p.endAt)}. Lampirkan bukti penutupan.`,
      link: `/work-permits?q=${encodeURIComponent(p.number)}`, severity: 'WARNING', dedupeKey: `work-permit-${p.id}-close`, dueDate: p.endAt,
    });
  }
}
