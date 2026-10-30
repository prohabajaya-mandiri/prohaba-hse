import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import { audit, actorName } from '../audit.js';
import { decrypt, encrypt, lookupHash, maskNik } from '../crypto.js';
import { iso, today } from '../dates.js';
import { readUpload, storeFile } from '../files.js';
import { nextNumber } from '../sequence.js';
import { CATEGORIES, CATEGORY_LABELS, nikInfo, normalizeCategory } from '../domain/personnel.js';
import { ageOn, EDUCATION_LEVELS, mcuIso, registrationChecks, REGISTRATION_STATUSES, START_WINDOW, startDateInWindow, waNumber } from '../domain/registration.js';
import { choice, date, ensure, id as parseId, InputError, nik as parseNik, object, text } from '../validation.js';
import { logApproval, notifyRoles } from './notify.js';
import { encryptSensitive, parsePersonnel } from './personnel.js';
import { siteExists } from './common.js';

// Hanya HO HSE & HRD yang memverifikasi (selaras MODULES.registrations di access.js).
export const APPROVER_ROLES = ['HO_HSE', 'HRD'];
const PUBLIC_ACTOR = { id: null, name: 'Formulir pendaftaran publik' };
const PUBLIC_FIELDS = ['name', 'nik', 'birthDate', 'education', 'startDate', 'category', 'position', 'siteId', 'phoneWa', 'ktpAddress', 'emergencyName', 'emergencyPhone', 'emergencyRelation', 'consent', 'website'];

// ─── Form publik ────────────────────────────────────────────────────────────
export function publicSites() {
  return prisma.site.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: [{ isHo: 'desc' }, { name: 'asc' }] });
}

/**
 * Batasi pengiriman: per IP (satu mess bisa berbagi WiFi, jadi longgar) dan total global
 * per 15 menit agar form publik tidak bisa dipakai membanjiri antrean.
 */
async function consumeQuota(db, ip, now = Date.now()) {
  const window = Math.floor(now / 900000);
  const resetAt = new Date((window + 1) * 900000);
  for (const [scope, value, limit] of [['ip', ip, 40], ['all', '*', 400]]) {
    const key = `reg:${scope}:${createHash('sha256').update(String(value)).digest('hex')}:${window}`;
    const row = await db.loginAttempt.upsert({ where: { key }, create: { key, attempts: 1, resetAt }, update: { attempts: { increment: 1 } } });
    if (row.attempts > limit) throw new InputError('Terlalu banyak pendaftaran dari jaringan ini. Coba lagi 15 menit lagi.', 429);
  }
}

/** Tanggal mulai kerja: wajib, dalam rentang wajar dari hari ini. */
function parseStartDate(value) {
  const d = date(value, 'Tanggal mulai kerja');
  ensure(startDateInWindow(d, today()), `Tanggal mulai kerja maksimal ${START_WINDOW.pastDays} hari lalu atau ${START_WINDOW.futureDays} hari ke depan.`);
  return d;
}

function parsePublic(values) {
  object(values, PUBLIC_FIELDS);
  const nik = parseNik(values.nik);
  const birthDate = date(values.birthDate, 'Tanggal lahir');
  const age = ageOn(birthDate);
  ensure(age !== null && age >= 15 && age <= 75, 'Tanggal lahir tidak valid.');
  const category = normalizeCategory(values.category);
  ensure(CATEGORIES.includes(category), 'Kategori wajib dipilih.');
  const startDate = parseStartDate(values.startDate);
  const phoneWa = text(values.phoneWa, 'No WhatsApp', 30);
  ensure(phoneWa.replace(/\D/g, '').length >= 9, 'No WhatsApp tidak valid.');
  const emergencyPhone = text(values.emergencyPhone, 'No HP kontak darurat', 30);
  ensure(emergencyPhone.replace(/\D/g, '').length >= 9, 'No HP kontak darurat tidak valid.');
  ensure(values.consent === 'true', 'Persetujuan pemrosesan data wajib dicentang.');
  return {
    nik,
    birthDate,
    gender: nikInfo(nik)?.gender ?? null,
    education: choice(values.education, EDUCATION_LEVELS, 'Pendidikan'),
    startDate,
    name: text(values.name, 'Nama lengkap', 150),
    category,
    position: text(values.position, 'Jabatan', 100),
    siteId: parseId(values.siteId, 'Tujuan site'),
    phoneWa,
    ktpAddress: text(values.ktpAddress, 'Alamat KTP', 500),
    emergencyName: text(values.emergencyName, 'Nama kontak darurat', 120),
    emergencyPhone,
    emergencyRelation: text(values.emergencyRelation, 'Hubungan kontak darurat', 60, true),
  };
}

export async function submitRegistration(form, { ip = 'local', now = new Date() } = {}) {
  const values = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') values[k] = v;
  // Honeypot: kolom tersembunyi yang hanya diisi bot. Balas sukses tanpa menyimpan.
  if (values.website) return { number: null };
  await consumeQuota(prisma, ip);
  const v = parsePublic(values);
  const upload = await readUpload(form.get('ktp'), { imagesOnly: true }).catch((e) => {
    throw new InputError(form.get('ktp')?.size ? e.message : 'Foto KTP wajib diunggah.');
  });
  const nikHash = lookupHash(v.nik);
  const pending = await prisma.registration.findFirst({ where: { nikHash, status: 'MENUNGGU' }, select: { number: true } });
  if (pending) throw new InputError(`NIK ini sudah mendaftar (${pending.number}) dan sedang diverifikasi HSE.`, 409);
  const site = await prisma.site.findUnique({ where: { id: v.siteId }, select: { id: true, code: true, name: true, isActive: true } });
  ensure(site?.isActive, 'Tujuan site tidak valid.');

  const start = iso(v.startDate);
  const mcu = mcuIso(start);
  const stored = await storeFile(upload, { sensitivity: 'KTP', entityType: 'REGISTRATION', siteId: site.id, label: 'KTP', uploadedBy: 'PUBLIC' });
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, 'registration', 'REG-', 6);
    const file = await tx.fileObject.create({ data: stored, select: { id: true } });
    const reg = await tx.registration.create({
      data: {
        number, name: v.name, nikHash, nikEnc: encrypt(v.nik), nikLast4: v.nik.slice(-4), birthDate: v.birthDate, gender: v.gender, education: v.education,
        category: v.category, position: v.position, siteId: site.id, phoneWa: v.phoneWa, ktpAddressEnc: encrypt(v.ktpAddress),
        emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone, emergencyRelation: v.emergencyRelation,
        ktpFileId: file.id, startDate: v.startDate, mcuDate: new Date(mcu + 'T00:00:00Z'), consentAt: now,
      },
    });
    await tx.fileObject.update({ where: { id: file.id }, data: { entityId: reg.id } });
    await notifyRoles(tx, APPROVER_ROLES, site.id, {
      type: 'APPROVAL',
      title: `Pendaftaran pegawai baru ${number}`,
      body: `${v.name} · ${CATEGORY_LABELS[v.category]} · ${v.position} → ${site.code} · mulai ${start}`,
      link: `/registrations/${reg.id}`,
      dedupeKey: `registration:${reg.id}`,
    });
    await audit(tx, PUBLIC_ACTOR, { action: 'CREATE', module: 'registrations', recordId: reg.id, siteId: site.id, after: { number, name: v.name, nik: maskNik(reg.nikLast4), category: v.category, position: v.position, education: v.education, site: site.code, start, mcu } });
    return { number, name: v.name, site: `${site.code} — ${site.name}`, startDate: start, mcuDate: mcu };
  }, { timeout: 20000 });
}

// ─── Verifikasi HO HSE / HRD ────────────────────────────────────────────────
function requireApprover(user) {
  if (!APPROVER_ROLES.includes(user?.role)) throw new InputError('Hanya HO HSE / HRD yang dapat memverifikasi pendaftaran.', 403);
}

export async function listRegistrations(user, f = {}) {
  requireApprover(user);
  const status = REGISTRATION_STATUSES.includes(f.status) ? f.status : 'MENUNGGU';
  const rows = await prisma.registration.findMany({
    where: { status },
    orderBy: status === 'MENUNGGU' ? { createdAt: 'asc' } : { decidedAt: 'desc' },
    take: 200,
    select: {
      id: true, number: true, status: true, name: true, nikLast4: true, birthDate: true, category: true, position: true,
      education: true, startDate: true, mcuDate: true, createdAt: true, decidedAt: true, decidedByName: true, personnelId: true,
      site: { select: { code: true, name: true } },
    },
  });
  const counts = Object.fromEntries((await prisma.registration.groupBy({ by: ['status'], _count: true })).map((r) => [r.status, r._count]));
  return { status, counts, rows: rows.map((r) => ({ ...r, nik: maskNik(r.nikLast4), age: ageOn(r.birthDate, r.startDate) })) };
}

/** Klinik MCU Pre-Employment terakhir dipakai, sebagai isian awal verifikator. */
async function lastClinic() {
  const row = await prisma.mcuRecord.findFirst({ where: { type: 'PRE_EMPLOYMENT' }, orderBy: { createdAt: 'desc' }, select: { clinic: true } });
  return row?.clinic ?? '';
}

export async function getRegistration(user, id) {
  requireApprover(user);
  const reg = await prisma.registration.findUnique({ where: { id }, include: { site: { select: { id: true, code: true, name: true } } } });
  ensure(reg, 'Pendaftaran tidak ditemukan.', 404);
  const nik = decrypt(reg.nikEnc);
  const [existing, pendingDupes, sites, clinic] = await Promise.all([
    prisma.personnel.findUnique({ where: { nikHash: reg.nikHash }, select: { id: true, name: true, nip: true, code: true, isFormer: true } }),
    prisma.registration.count({ where: { nikHash: reg.nikHash, status: 'MENUNGGU', id: { not: id } } }),
    prisma.site.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    lastClinic(),
  ]);
  // NIK & alamat KTP utuh dibuka untuk verifikasi: dicatat sebagai akses data sensitif.
  await audit(null, user, { action: 'VIEW_SENSITIVE', module: 'registrations', recordId: id, siteId: reg.siteId, note: 'KTP ' + reg.number });
  const { nikEnc, nikHash, ktpAddressEnc, ...rest } = reg;
  void nikEnc; void nikHash;
  return {
    ...rest,
    nik,
    ktpAddress: decrypt(ktpAddressEnc),
    age: ageOn(reg.birthDate, reg.startDate),
    existing,
    checks: registrationChecks({ nik, birthDate: reg.birthDate, gender: reg.gender, hasKtp: Boolean(reg.ktpFileId) }, { existing, pendingDupes, today: reg.startDate }),
    sites,
    defaultClinic: clinic,
    waLink: waNumber(reg.phoneWa),
  };
}

/** Kunci keputusan: hanya satu verifikator yang bisa memutuskan pendaftaran yang sama. */
async function claim(tx, id, data) {
  const r = await tx.registration.updateMany({ where: { id, status: 'MENUNGGU' }, data });
  ensure(r.count === 1, 'Pendaftaran sudah diputuskan oleh verifikator lain.', 409);
}

export async function approveRegistration(user, id, body) {
  requireApprover(user);
  object(body, ['name', 'category', 'position', 'siteId', 'birthDate', 'education', 'startDate', 'phoneWa', 'mcuDate', 'clinic', 'note']);
  const reg = await prisma.registration.findUnique({ where: { id } });
  ensure(reg, 'Pendaftaran tidak ditemukan.', 404);
  ensure(reg.status === 'MENUNGGU', 'Pendaftaran sudah diputuskan.', 409);
  const siteId = parseId(body.siteId ?? reg.siteId, 'Site');
  // Verifikator boleh mengoreksi tanggal mulai kerja & pendidikan (pendaftaran lama mungkin belum berisi pendidikan).
  const startDate = date(body.startDate ?? iso(reg.startDate), 'Tanggal mulai kerja');
  const start = iso(startDate);
  const education = body.education === undefined ? reg.education : body.education || null;
  if (education) choice(education, EDUCATION_LEVELS, 'Pendidikan');
  // Data personel divalidasi dengan aturan master karyawan yang sama dengan form Tambah personel.
  const { v, sensitive } = parsePersonnel({
    nik: decrypt(reg.nikEnc),
    name: body.name ?? reg.name,
    birthDate: body.birthDate ?? iso(reg.birthDate),
    gender: reg.gender ?? undefined,
    education: education ?? undefined,
    category: body.category ?? reg.category,
    position: body.position ?? reg.position,
    phoneWa: body.phoneWa ?? reg.phoneWa,
    emergencyName: reg.emergencyName,
    emergencyPhone: reg.emergencyPhone,
    emergencyRelation: reg.emergencyRelation ?? undefined,
    ktpAddress: decrypt(reg.ktpAddressEnc),
    startDate: start,
  }, null, { user });
  const mcuDate = date(body.mcuDate ?? iso(reg.mcuDate), 'Tanggal MCU');
  ensure(mcuDate >= startDate, 'Tanggal MCU tidak boleh sebelum tanggal mulai kerja.');
  const clinic = text(body.clinic, 'Klinik MCU', 150);
  const note = text(body.note, 'Catatan', 500, true);

  return prisma.$transaction(async (tx) => {
    const site = await siteExists(tx, siteId);
    ensure(site.isActive, 'Site tujuan tidak aktif.');
    const now = new Date();
    await claim(tx, id, { status: 'DISETUJUI', decidedById: user.id, decidedByName: actorName(user), decidedAt: now, decisionNote: note });

    const existing = await tx.personnel.findUnique({ where: { nikHash: reg.nikHash }, select: { id: true, code: true, name: true, isFormer: true } });
    ensure(!existing || existing.isFormer, `NIK sudah terdaftar sebagai personel aktif ${existing?.name} (${existing?.code}). Tolak pendaftaran ini.`, 409);
    let person;
    if (existing) {
      // Mantan personel kembali bekerja: profil lama diaktifkan (satu NIK satu profil), riwayat tetap tersambung.
      person = await tx.personnel.update({
        where: { id: existing.id },
        data: {
          name: v.name, birthDate: v.birthDate, gender: v.gender, education: v.education, category: v.category, position: v.position, phoneWa: v.phoneWa,
          emergencyName: v.emergencyName, emergencyPhone: v.emergencyPhone, emergencyRelation: v.emergencyRelation,
          ktpAddressEnc: encrypt(sensitive.ktpAddress), startDate: v.startDate, currentSiteId: siteId, isFormer: false, workStatus: 'MCU',
          foremanId: null,
        },
      });
    } else {
      const code = await nextNumber(tx, 'personnel', 'PJM-', 6);
      person = await tx.personnel.create({
        data: { ...v, ...encryptSensitive(sensitive), code, initialSiteId: siteId, currentSiteId: siteId, workStatus: 'MCU' },
      });
    }
    await tx.placement.create({
      data: { personnelId: person.id, siteId, position: v.position, startDate: v.startDate, status: 'ACTIVE', notes: `Pendaftaran ${reg.number}`, createdBy: user.id },
    });
    if (reg.ktpFileId) {
      await tx.fileObject.update({ where: { id: reg.ktpFileId }, data: { entityType: 'PERSONNEL', entityId: person.id, siteId } });
      await tx.personnel.update({ where: { id: person.id }, data: { ktpFileId: reg.ktpFileId } });
    }
    // Hari mulai kerja = screening, MCU sesuai rencana (default H+1, selaras durasi standar mcu.durations).
    await tx.mcuRecord.updateMany({ where: { personnelId: person.id, isLatest: true }, data: { isLatest: false } });
    const mcu = await tx.mcuRecord.create({
      data: { personnelId: person.id, siteId, type: 'PRE_EMPLOYMENT', clinic, stage: 'SCREENING', screeningDate: startDate, mcuDate, result: 'PENDING', isLatest: true, createdBy: user.id },
    });
    await tx.registration.update({ where: { id }, data: { personnelId: person.id, startDate, education } });
    await tx.notification.updateMany({ where: { dedupeKey: `registration:${id}`, readAt: null }, data: { readAt: now } });
    await logApproval(tx, user, { entityType: 'REGISTRATION', entityId: id, step: 'APPROVE', decision: existing ? 'DISETUJUI (profil lama diaktifkan)' : 'DISETUJUI', note });
    await audit(tx, user, {
      action: existing ? 'UPDATE' : 'CREATE', module: 'personnel', recordId: person.id, siteId,
      after: { name: v.name, code: person.code, category: v.category, position: v.position, workStatus: 'MCU', startDate: start, mcu: mcu.id },
      note: `Dari pendaftaran ${reg.number}${existing ? ' — mantan personel diaktifkan kembali' : ''}`,
    });
    return { personnelId: person.id, code: person.code, reactivated: Boolean(existing), mcuDate: iso(mcuDate), clinic, wa: waNumber(v.phoneWa), name: v.name, site: site.code };
  }, { timeout: 20000 });
}

export async function rejectRegistration(user, id, body) {
  requireApprover(user);
  object(body, ['note']);
  const note = text(body.note, 'Alasan penolakan', 500);
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({ where: { id }, select: { number: true, siteId: true } });
    ensure(reg, 'Pendaftaran tidak ditemukan.', 404);
    const now = new Date();
    await claim(tx, id, { status: 'DITOLAK', decidedById: user.id, decidedByName: actorName(user), decidedAt: now, decisionNote: note });
    await tx.notification.updateMany({ where: { dedupeKey: `registration:${id}`, readAt: null }, data: { readAt: now } });
    await logApproval(tx, user, { entityType: 'REGISTRATION', entityId: id, step: 'REJECT', decision: 'DITOLAK', note });
    await audit(tx, user, { action: 'REJECT', module: 'registrations', recordId: id, siteId: reg.siteId, note: `${reg.number}: ${note}` });
    return { id };
  });
}
