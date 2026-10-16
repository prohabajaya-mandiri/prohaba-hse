import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { canSeeSensitive, siteFilter, siteScope } from '../access.js';
import { audit, diff } from '../audit.js';
import { decrypt, encrypt, lookupHash, maskAccount, maskNik } from '../crypto.js';
import { iso, today } from '../dates.js';
import { nextNumber } from '../sequence.js';
import { BLOOD_TYPES, CATEGORIES, IMPORT_COLUMNS, MARITAL, WORK_STATUSES, mapImportRow } from '../domain/personnel.js';
import { fitness } from '../domain/mcu.js';
import { getSetting } from '../settings.js';
import { bool, choice, ensure, InputError, nik as parseNik, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { attachFiles, requireSite, scopedPersonnel, siteExists } from './common.js';

const EDITABLE = [
  'nik', 'name', 'birthPlace', 'birthDate', 'gender', 'maritalStatus', 'education', 'major', 'phoneWa',
  'emergencyName', 'emergencyPhone', 'emergencyRelation', 'ktpAddress', 'domicileAddress', 'originRegion',
  'category', 'position', 'siteId', 'startDate', 'bpjsKesehatan', 'bpjsKetenagakerjaan', 'bloodType',
  'medicalHistory', 'shirtSize', 'shoeSize', 'bankName', 'bankAccount', 'bankAccountName', 'foremanId', 'ocrVerified',
];

/** Validasi & normalisasi input personel. `existing` diisi saat edit. */
export function parsePersonnel(body, existing = null) {
  object(body, EDITABLE);
  const v = {
    name: text(body.name, 'Nama', 150),
    birthPlace: text(body.birthPlace, 'Tempat lahir', 80, true),
    birthDate: optionalDate(body.birthDate, 'Tanggal lahir'),
    gender: optionalChoice(body.gender, ['L', 'P'], 'Jenis kelamin'),
    maritalStatus: optionalChoice(body.maritalStatus, MARITAL, 'Status nikah'),
    education: text(body.education, 'Pendidikan', 60, true),
    major: text(body.major, 'Jurusan', 100, true),
    phoneWa: text(body.phoneWa, 'No WA', 30, true),
    emergencyName: text(body.emergencyName, 'Kontak darurat', 120, true),
    emergencyPhone: text(body.emergencyPhone, 'No kontak darurat', 30, true),
    emergencyRelation: text(body.emergencyRelation, 'Hubungan kontak darurat', 60, true),
    domicileAddress: text(body.domicileAddress, 'Alamat domisili', 500, true),
    originRegion: text(body.originRegion, 'Asal daerah', 100, true),
    category: choice(body.category, CATEGORIES, 'Kategori'),
    position: text(body.position, 'Jabatan', 100),
    startDate: optionalDate(body.startDate, 'Tanggal mulai'),
    bpjsKesehatan: text(body.bpjsKesehatan, 'BPJS Kesehatan', 30, true),
    bpjsKetenagakerjaan: text(body.bpjsKetenagakerjaan, 'BPJS Ketenagakerjaan', 30, true),
    bloodType: optionalChoice(body.bloodType ? String(body.bloodType).toUpperCase() : body.bloodType, BLOOD_TYPES, 'Golongan darah'),
    shirtSize: text(body.shirtSize, 'Ukuran baju', 10, true),
    shoeSize: text(body.shoeSize, 'Ukuran sepatu', 10, true),
    bankName: text(body.bankName, 'Nama bank', 60, true),
    bankAccountName: text(body.bankAccountName, 'Nama pemilik rekening', 120, true),
    foremanId: optionalId(body.foremanId, 'Mandor'),
    ocrVerified: body.ocrVerified === undefined ? existing?.ocrVerified ?? false : bool(body.ocrVerified),
  };
  // Field sensitif: undefined = tidak diubah (form edit tidak menampilkan nilai terbuka).
  const sensitive = {};
  if (!existing || body.nik !== undefined) sensitive.nik = parseNik(body.nik);
  if (!existing || body.ktpAddress !== undefined) sensitive.ktpAddress = text(body.ktpAddress, 'Alamat KTP', 500);
  if (body.bankAccount !== undefined) {
    const acc = body.bankAccount ? String(body.bankAccount).replace(/\s/g, '') : null;
    ensure(!acc || /^\d{5,30}$/.test(acc), 'No rekening hanya angka.');
    sensitive.bankAccount = acc;
  }
  if (body.medicalHistory !== undefined) sensitive.medicalHistory = text(body.medicalHistory, 'Riwayat penyakit', 1000, true);
  // Rekening wajib untuk staff.
  const hasAccount = sensitive.bankAccount !== undefined ? Boolean(sensitive.bankAccount) : Boolean(existing?.bankAccountEnc);
  if (v.category === 'STAFF') ensure(hasAccount && (v.bankName || existing?.bankName), 'Rekening (bank & nomor) wajib untuk staff.');
  if (v.category !== 'MANPOWER') v.foremanId = null;
  return { v, sensitive };
}

function encryptSensitive(sensitive) {
  const out = {};
  if (sensitive.nik !== undefined) Object.assign(out, { nikHash: lookupHash(sensitive.nik), nikEnc: encrypt(sensitive.nik), nikLast4: sensitive.nik.slice(-4) });
  if (sensitive.ktpAddress !== undefined) out.ktpAddressEnc = encrypt(sensitive.ktpAddress);
  if (sensitive.bankAccount !== undefined) out.bankAccountEnc = encrypt(sensitive.bankAccount);
  if (sensitive.medicalHistory !== undefined) out.medicalHistoryEnc = encrypt(sensitive.medicalHistory);
  return out;
}

async function checkDuplicate(db, nik, exceptId = null) {
  const dup = await db.personnel.findUnique({ where: { nikHash: lookupHash(nik) }, select: { id: true, code: true } });
  if (dup && dup.id !== exceptId) throw new InputError(`NIK sudah terdaftar sebagai ${dup.code}. Gunakan profil yang ada (satu NIK satu profil).`, 409);
}

async function checkForeman(db, foremanId, selfId) {
  if (!foremanId) return;
  ensure(foremanId !== selfId, 'Personel tidak dapat menjadi mandor dirinya sendiri.');
  const f = await db.personnel.findUnique({ where: { id: foremanId }, select: { id: true } });
  ensure(f, 'Mandor tidak ditemukan.');
}

export async function createPersonnel(user, body, ktpFile) {
  const siteId = requireSite(user, body.siteId);
  const { v, sensitive } = parsePersonnel(body);
  return prisma.$transaction(async (tx) => {
    await siteExists(tx, siteId);
    await checkDuplicate(tx, sensitive.nik);
    await checkForeman(tx, v.foremanId);
    const code = await nextNumber(tx, 'personnel', 'PJM-', 6);
    const person = await tx.personnel.create({
      data: { ...v, ...encryptSensitive(sensitive), code, initialSiteId: siteId, currentSiteId: siteId },
    });
    await tx.placement.create({
      data: { personnelId: person.id, siteId, position: v.position, startDate: v.startDate ?? today(), status: 'ACTIVE', notes: 'Penempatan awal', createdBy: user.id },
    });
    if (ktpFile) await saveKtp(tx, user, person, ktpFile);
    await audit(tx, user, { action: 'CREATE', module: 'personnel', recordId: person.id, siteId, after: { ...v, code, nik: maskNik(sensitive.nik.slice(-4)) } });
    return { id: person.id, code };
  }, { timeout: 20000 });
}

async function saveKtp(tx, user, person, file) {
  const [row] = await attachFiles(tx, user, [file], { entityType: 'PERSONNEL', entityId: person.id, siteId: person.currentSiteId, sensitivity: 'KTP', label: 'KTP' });
  await tx.personnel.update({ where: { id: person.id }, data: { ktpFileId: row.id } });
}

export async function updatePersonnel(user, id, body, ktpFile) {
  const existing = await scopedPersonnel(user, id);
  // Field sensitif kosong pada form edit berarti tidak diubah.
  for (const k of ['nik', 'ktpAddress', 'bankAccount', 'medicalHistory']) if (body[k] === '') delete body[k];
  delete body.siteId; // site berubah hanya melalui mutasi

  const { v, sensitive } = parsePersonnel(body, existing);
  return prisma.$transaction(async (tx) => {
    if (sensitive.nik) await checkDuplicate(tx, sensitive.nik, id);
    await checkForeman(tx, v.foremanId, id);
    const enc = encryptSensitive(sensitive);
    await tx.personnel.update({ where: { id }, data: { ...v, ...enc } });
    if (ktpFile) await saveKtp(tx, user, existing, ktpFile);
    const d = diff(existing, { ...v, ...enc });
    if (d.changed || ktpFile) await audit(tx, user, { action: 'UPDATE', module: 'personnel', recordId: id, siteId: existing.currentSiteId, ...d, note: ktpFile ? 'File KTP diperbarui' : null });
    return { id };
  }, { timeout: 20000 });
}

export async function setWorkStatus(user, id, body) {
  object(body, ['workStatus', 'note']);
  const status = choice(body.workStatus, WORK_STATUSES, 'Status kerja');
  const existing = await scopedPersonnel(user, id);
  return prisma.$transaction(async (tx) => {
    await tx.personnel.update({ where: { id }, data: { workStatus: status, isFormer: status === 'RESIGN' } });
    await audit(tx, user, { action: 'UPDATE', module: 'personnel', recordId: id, siteId: existing.currentSiteId, before: { workStatus: existing.workStatus }, after: { workStatus: status }, note: text(body.note, 'Catatan', 500, true) });
    return { id, workStatus: status };
  });
}

// ─── Daftar & pencarian ─────────────────────────────────────────────────────
export function personnelWhere(user, f = {}) {
  const where = { ...siteFilter(user, f.siteId, 'currentSiteId') };
  if (f.category && CATEGORIES.includes(f.category)) where.category = f.category;
  if (f.workStatus && WORK_STATUSES.includes(f.workStatus)) where.workStatus = f.workStatus;
  if (f.former === '1') where.isFormer = true;
  else if (f.former !== 'all') where.isFormer = false;
  if (f.q) {
    const q = String(f.q).slice(0, 80).trim();
    const nikLike = /^\d{16}$/.test(q);
    where.OR = nikLike
      ? [{ nikHash: lookupHash(q) }]
      : [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { position: { contains: q, mode: 'insensitive' } }, ...(/^\d{4}$/.test(q) ? [{ nikLast4: q }] : [])];
  }
  return where;
}

export async function listPersonnel(user, f, { skip = 0, take = 50 } = {}) {
  const where = personnelWhere(user, f);
  const [rows, total] = await Promise.all([
    prisma.personnel.findMany({
      where, skip, take,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true, code: true, name: true, nikLast4: true, category: true, position: true, workStatus: true, isFormer: true, phoneWa: true,
        currentSite: { select: { code: true, name: true } },
        foreman: { select: { name: true } },
        mcus: { where: { isLatest: true }, take: 1, select: { result: true, validUntil: true, fuDueDate: true } },
        permits: { where: { revokedAt: null }, orderBy: { endDate: 'desc' }, take: 1, select: { endDate: true, number: true } },
      },
    }),
    prisma.personnel.count({ where }),
  ]);
  const now = today();
  return {
    total,
    rows: rows.map((p) => ({
      ...p,
      nik: maskNik(p.nikLast4),
      siteName: p.currentSite ? `${p.currentSite.code}` : '-',
      fitness: fitness(p.mcus[0], now),
      permitEnd: p.permits[0]?.endDate ?? null,
    })),
  };
}

export async function pickPersonnel(user, f) {
  const where = personnelWhere(user, { q: f.q, siteId: f.siteId, category: f.category, workStatus: f.workStatus, former: f.former });
  const rows = await prisma.personnel.findMany({
    where, take: 20, orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, position: true, category: true, currentSiteId: true, currentSite: { select: { code: true } } },
  });
  return { rows: rows.map((r) => ({ ...r, siteName: r.currentSite?.code })) };
}

// ─── Detail dengan perlindungan data sensitif ───────────────────────────────
export async function getPersonnel(user, id) {
  await scopedPersonnel(user, id);
  const p = await prisma.personnel.findUnique({
    where: { id },
    include: {
      currentSite: { select: { id: true, code: true, name: true } },
      initialSite: { select: { code: true, name: true } },
      foreman: { select: { id: true, name: true, code: true } },
      crew: { select: { id: true, name: true, code: true, position: true } },
      placements: { orderBy: { startDate: 'desc' }, include: { site: { select: { code: true, name: true } } } },
      mutations: { orderBy: { createdAt: 'desc' }, include: { toSite: { select: { code: true } } } },
      mcus: { orderBy: [{ mcuDate: 'desc' }, { createdAt: 'desc' }] },
      permits: { orderBy: { endDate: 'desc' }, include: { site: { select: { code: true } } } },
      leaves: { orderBy: { startDate: 'desc' }, take: 20 },
      certificates: { include: { competency: { select: { name: true } } }, orderBy: { expiryDate: 'asc' } },
      mobilizations: { include: { mobilization: { select: { code: true, type: true, departDate: true, status: true, destination: true } } }, orderBy: { id: 'desc' }, take: 20 },
    },
  });
  const siteId = p.currentSiteId;
  const ktp = canSeeSensitive(user, 'KTP', siteId);
  const medical = canSeeSensitive(user, 'MEDICAL', siteId);
  const bank = canSeeSensitive(user, 'BANK', siteId);
  const { nikEnc, nikHash, ktpAddressEnc, bankAccountEnc, medicalHistoryEnc, ...rest } = p;
  void nikEnc; void nikHash; void ktpAddressEnc;
  return {
    ...rest,
    nik: maskNik(p.nikLast4),
    bankAccount: bank ? maskAccount(decrypt(bankAccountEnc)) : bankAccountEnc ? '[dibatasi]' : null,
    medicalHistory: medical ? decrypt(medicalHistoryEnc) : medicalHistoryEnc ? '[dibatasi]' : null,
    mcus: p.mcus.map(({ notesEnc, ...m }) => ({ ...m, notes: medical ? decrypt(notesEnc) : notesEnc ? '[dibatasi]' : null })),
    ktpFileId: ktp ? p.ktpFileId : null,
    access: { ktp, medical, bank },
    fitness: fitness(p.mcus.find((m) => m.isLatest), today()),
  };
}

/** Tampilkan data sensitif utuh (dicatat di audit log). */
export async function revealSensitive(user, id, kind) {
  const p = await scopedPersonnel(user, id);
  const map = { KTP: ['KTP', () => ({ nik: decrypt(p.nikEnc), ktpAddress: decrypt(p.ktpAddressEnc) })], BANK: ['BANK', () => ({ bankAccount: decrypt(p.bankAccountEnc) })] };
  ensure(Object.hasOwn(map, kind), 'Jenis data tidak valid.');
  if (!canSeeSensitive(user, map[kind][0], p.currentSiteId)) throw new InputError('Anda tidak memiliki akses ke data ini.', 403);
  await audit(null, user, { action: 'VIEW_SENSITIVE', module: 'personnel', recordId: id, siteId: p.currentSiteId, note: kind });
  return map[kind][1]();
}

// ─── Import Excel: preview → tinjau → simpan ────────────────────────────────
export function importTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(([, h, req]) => (req ? h + ' *' : h))]);
  ws['!cols'] = IMPORT_COLUMNS.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personel');
  const info = XLSX.utils.aoa_to_sheet([
    ['Petunjuk'],
    ['Kolom bertanda * wajib. Tanggal format YYYY-MM-DD.'],
    ['Format kolom NIK dan No Rekening sebagai Text agar digit tidak berubah.'],
    ['Kategori: STAFF / MANPOWER / HARIAN_KANTOR. Rekening wajib untuk STAFF.'],
    ['Kode Site mengacu Master Site. Kode Mandor = kode personel PJM-xxxxxx (opsional, khusus manpower).'],
    ['NIK yang sudah terdaftar tidak akan membuat profil baru.'],
  ]);
  XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function validateImport(user, rawRows) {
  ensure(Array.isArray(rawRows) && rawRows.length > 0 && rawRows.length <= 1000, 'Import 1–1000 baris per file.');
  const sites = await prisma.site.findMany({ select: { id: true, code: true } });
  const siteByCode = Object.fromEntries(sites.map((s) => [s.code.toUpperCase(), s.id]));
  const seen = new Map();
  const results = [];
  const foremanCodes = [...new Set(rawRows.map((r) => mapImportRow(r).foremanCode).filter(Boolean))];
  const foremen = await prisma.personnel.findMany({ where: { code: { in: foremanCodes } }, select: { id: true, code: true } });
  const foremanByCode = Object.fromEntries(foremen.map((f) => [f.code, f.id]));
  for (const [index, raw] of rawRows.entries()) {
    const row = mapImportRow(raw);
    const errors = [];
    let parsed = null;
    try {
      const siteId = siteByCode[String(row.siteCode ?? '').toUpperCase()];
      ensure(siteId, 'Kode site tidak dikenal.');
      requireSite(user, siteId);
      const { siteCode, foremanCode, ...body } = row;
      void siteCode;
      if (foremanCode) {
        ensure(foremanByCode[foremanCode], 'Kode mandor tidak ditemukan.');
        body.foremanId = foremanByCode[foremanCode];
      }
      if (body.category) body.category = body.category.toUpperCase().replace(/\s+/g, '_');
      if (body.maritalStatus) body.maritalStatus = body.maritalStatus.toUpperCase().replace(/\s+/g, '_');
      if (body.gender) body.gender = body.gender.toUpperCase().slice(0, 1);
      parsed = { ...parsePersonnel({ ...body, siteId: undefined }), siteId };
    } catch (e) {
      errors.push(e.message);
    }
    let duplicate = null;
    if (parsed) {
      const nik = parsed.sensitive.nik;
      if (seen.has(nik)) errors.push(`NIK ganda dengan baris ${seen.get(nik) + 2}.`);
      seen.set(nik, index);
      const dup = await prisma.personnel.findUnique({ where: { nikHash: lookupHash(nik) }, select: { code: true } });
      if (dup) duplicate = dup.code;
    }
    results.push({ row: index + 2, name: row.name ?? '-', nik: row.nik ? maskNik(String(row.nik).slice(-4)) : '-', siteCode: row.siteCode ?? '-', category: row.category ?? '-', errors, duplicate, parsed });
  }
  return results;
}

export async function importPreview(user, rows) {
  const results = await validateImport(user, rows);
  return {
    rows: results.map(({ parsed, ...r }) => { void parsed; return r; }),
    summary: {
      total: results.length,
      valid: results.filter((r) => !r.errors.length && !r.duplicate).length,
      duplicate: results.filter((r) => r.duplicate).length,
      invalid: results.filter((r) => r.errors.length).length,
    },
  };
}

export async function importCommit(user, rows) {
  const results = await validateImport(user, rows);
  const ok = results.filter((r) => !r.errors.length && !r.duplicate);
  ensure(ok.length > 0, 'Tidak ada baris valid untuk disimpan.');
  const created = await prisma.$transaction(async (tx) => {
    const codes = [];
    for (const r of ok) {
      const { v, sensitive } = r.parsed;
      const code = await nextNumber(tx, 'personnel', 'PJM-', 6);
      const person = await tx.personnel.create({ data: { ...v, ...encryptSensitive(sensitive), code, initialSiteId: r.parsed.siteId, currentSiteId: r.parsed.siteId } });
      await tx.placement.create({ data: { personnelId: person.id, siteId: r.parsed.siteId, position: v.position, startDate: v.startDate ?? today(), status: 'ACTIVE', notes: 'Import Excel', createdBy: user.id } });
      codes.push(code);
    }
    await audit(tx, user, { action: 'IMPORT', module: 'personnel', note: `Import ${codes.length} personel (${results.length - ok.length} baris dilewati)`, after: { codes } });
    return codes;
  }, { timeout: 120000 });
  return { created: created.length, skipped: results.length - ok.length };
}

// ─── Export ─────────────────────────────────────────────────────────────────
export async function exportPersonnel(user, f) {
  const rows = await prisma.personnel.findMany({
    where: personnelWhere(user, f), orderBy: { name: 'asc' }, take: 10000,
    include: { currentSite: { select: { code: true } }, foreman: { select: { code: true } } },
  });
  const ktpAll = siteScope(user) === null && canSeeSensitive(user, 'KTP');
  const data = rows.map((p) => {
    const ktp = ktpAll || canSeeSensitive(user, 'KTP', p.currentSiteId);
    return {
      Kode: p.code, NIK: ktp ? decrypt(p.nikEnc) : maskNik(p.nikLast4), Nama: p.name, 'Tempat Lahir': p.birthPlace, 'Tanggal Lahir': iso(p.birthDate),
      'Jenis Kelamin': p.gender, 'Status Nikah': p.maritalStatus, Pendidikan: p.education, Jurusan: p.major, 'No WA': p.phoneWa,
      'Kontak Darurat': p.emergencyName, 'No Kontak Darurat': p.emergencyPhone, 'Alamat KTP': ktp ? decrypt(p.ktpAddressEnc) : '[dibatasi]',
      'Alamat Domisili': p.domicileAddress, 'Asal Daerah': p.originRegion, Kategori: p.category, Jabatan: p.position, Site: p.currentSite?.code,
      'Tanggal Mulai': iso(p.startDate), 'Status Kerja': p.workStatus, 'BPJS Kesehatan': p.bpjsKesehatan, 'BPJS Ketenagakerjaan': p.bpjsKetenagakerjaan,
      'Gol Darah': p.bloodType, 'Ukuran Baju': p.shirtSize, 'Ukuran Sepatu': p.shoeSize, Mandor: p.foreman?.code, 'Mantan Personel': p.isFormer ? 'Ya' : '',
    };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Personel');
  await audit(null, user, { action: 'EXPORT', module: 'personnel', note: `Export ${rows.length} personel` });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function salaryMatrix() {
  return getSetting('access.salary');
}
