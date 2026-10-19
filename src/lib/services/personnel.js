import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { canSeeSensitive, canSetEmployment, siteFilter, siteScope } from '../access.js';
import { audit, diff } from '../audit.js';
import { decrypt, encrypt, lookupHash, maskAccount, maskNik } from '../crypto.js';
import { daysBetween, iso, today } from '../dates.js';
import { nextNumber } from '../sequence.js';
import { BLOOD_TYPES, CATEGORIES, EMPLOYMENT_TYPES, IMPORT_COLUMNS, MARITAL, WORK_STATUSES, mapImportRow, normalizeImportRow, tenure } from '../domain/personnel.js';
import { fitness } from '../domain/mcu.js';
import { getSetting } from '../settings.js';
import { bool, choice, ensure, InputError, nik as parseNik, npwp as parseNpwp, object, optionalChoice, optionalDate, optionalId, text } from '../validation.js';
import { attachFiles, requireSite, scopedPersonnel, siteExists } from './common.js';

const EDITABLE = [
  'nik', 'name', 'birthPlace', 'birthDate', 'gender', 'maritalStatus', 'education', 'major', 'phoneWa',
  'emergencyName', 'emergencyPhone', 'emergencyRelation', 'ktpAddress', 'domicileAddress', 'originRegion',
  'category', 'position', 'siteId', 'startDate', 'employmentType', 'contractEndDate', 'npwp', 'bpjsKesehatan', 'bpjsKetenagakerjaan', 'bloodType',
  'medicalHistory', 'shirtSize', 'shoeSize', 'bankName', 'bankAccount', 'bankAccountName', 'foremanId', 'ocrVerified',
];

/**
 * Validasi & normalisasi input personel. `existing` diisi saat edit.
 * `errors` (array) diisi bila ingin mengumpulkan seluruh kesalahan sekaligus (import Excel);
 * tanpa `errors`, kesalahan pertama langsung dilempar.
 * `requireBank` = false untuk import Excel (rekening boleh dilengkapi kemudian).
 */
export function parsePersonnel(body, existing = null, { user = null, errors = null, requireBank = true } = {}) {
  object(body, EDITABLE);
  const f = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (!errors || !(e instanceof InputError)) throw e;
      errors.push(e.message);
      return null;
    }
  };
  const v = {
    name: f(() => text(body.name, 'Nama', 150)),
    birthPlace: f(() => text(body.birthPlace, 'Tempat lahir', 80, true)),
    birthDate: f(() => optionalDate(body.birthDate, 'Tanggal lahir')),
    gender: f(() => optionalChoice(body.gender, ['L', 'P'], 'Jenis kelamin')),
    maritalStatus: f(() => optionalChoice(body.maritalStatus, MARITAL, 'Status nikah')),
    education: f(() => text(body.education, 'Pendidikan', 60, true)),
    major: f(() => text(body.major, 'Jurusan', 100, true)),
    phoneWa: f(() => text(body.phoneWa, 'No WA', 30, true)),
    emergencyName: f(() => text(body.emergencyName, 'Kontak darurat', 120, true)),
    emergencyPhone: f(() => text(body.emergencyPhone, 'No kontak darurat', 30, true)),
    emergencyRelation: f(() => text(body.emergencyRelation, 'Hubungan kontak darurat', 60, true)),
    domicileAddress: f(() => text(body.domicileAddress, 'Alamat domisili', 500, true)),
    originRegion: f(() => text(body.originRegion, 'Asal daerah', 100, true)),
    category: f(() => choice(body.category, CATEGORIES, 'Kategori')),
    position: f(() => text(body.position, 'Jabatan', 100)),
    startDate: f(() => optionalDate(body.startDate, 'Tanggal mulai')),
    bpjsKesehatan: f(() => text(body.bpjsKesehatan, 'BPJS Kesehatan', 30, true)),
    bpjsKetenagakerjaan: f(() => text(body.bpjsKetenagakerjaan, 'BPJS Ketenagakerjaan', 30, true)),
    bloodType: f(() => optionalChoice(body.bloodType ? String(body.bloodType).toUpperCase() : body.bloodType, BLOOD_TYPES, 'Golongan darah')),
    shirtSize: f(() => text(body.shirtSize, 'Ukuran baju', 10, true)),
    shoeSize: f(() => text(body.shoeSize, 'Ukuran sepatu', 10, true)),
    bankName: f(() => text(body.bankName, 'Nama bank', 60, true)),
    bankAccountName: f(() => text(body.bankAccountName, 'Nama pemilik rekening', 120, true)),
    foremanId: f(() => optionalId(body.foremanId, 'Mandor')),
    ocrVerified: body.ocrVerified === undefined ? existing?.ocrVerified ?? false : bool(body.ocrVerified),
  };
  // Status kepegawaian: undefined = tidak diubah. Hanya HRD/HO HSE yang boleh menetapkan atau mengubah.
  if (!existing || body.employmentType !== undefined || body.contractEndDate !== undefined) {
    const type = body.employmentType !== undefined ? f(() => optionalChoice(body.employmentType, EMPLOYMENT_TYPES, 'Status kepegawaian')) : existing?.employmentType ?? null;
    let end = body.contractEndDate !== undefined ? f(() => optionalDate(body.contractEndDate, 'Akhir kontrak')) : existing?.contractEndDate ?? null;
    if (type !== 'PKWT') end = null; // PKWTT tidak memiliki akhir kontrak
    const start = v.startDate ?? existing?.startDate;
    f(() => ensure(!end || !start || end >= start, 'Akhir kontrak tidak boleh sebelum tanggal mulai.'));
    const changed = type !== (existing?.employmentType ?? null) || (end?.getTime() ?? null) !== (existing?.contractEndDate ? new Date(existing.contractEndDate).getTime() : null);
    if (changed) f(() => ensure(canSetEmployment(user), 'Status kepegawaian (PKWT/PKWTT) hanya dapat diisi atau diubah oleh HRD / HO HSE.', 403));
    v.employmentType = type;
    v.contractEndDate = end;
  }
  // Field sensitif: undefined = tidak diubah (form edit tidak menampilkan nilai terbuka).
  const sensitive = {};
  if (!existing || body.nik !== undefined) sensitive.nik = f(() => parseNik(body.nik));
  if (!existing || body.ktpAddress !== undefined) sensitive.ktpAddress = f(() => text(body.ktpAddress, 'Alamat KTP', 500));
  if (body.npwp !== undefined) sensitive.npwp = f(() => parseNpwp(body.npwp));
  if (body.bankAccount !== undefined) {
    const acc = body.bankAccount ? String(body.bankAccount).replace(/[\s.-]/g, '') : null;
    f(() => ensure(!acc || /^\d{5,30}$/.test(acc), 'No rekening hanya angka (5–30 digit).'));
    sensitive.bankAccount = acc;
  }
  if (body.medicalHistory !== undefined) sensitive.medicalHistory = f(() => text(body.medicalHistory, 'Riwayat penyakit', 1000, true));
  // Rekening wajib untuk staff saat ditambah lewat form. Tidak dipaksakan saat edit, karena personel
  // hasil import boleh belum memiliki rekening dan field rekening tidak tampil bagi peran tanpa akses BANK.
  if (requireBank && !existing && v.category === 'STAFF') f(() => ensure(sensitive.bankAccount && v.bankName, 'Rekening (nama bank & no rekening) wajib untuk kategori STAFF.'));
  if (v.category !== 'MANPOWER') v.foremanId = null;
  return { v, sensitive };
}

function encryptSensitive(sensitive) {
  const out = {};
  if (sensitive.nik !== undefined) Object.assign(out, { nikHash: lookupHash(sensitive.nik), nikEnc: encrypt(sensitive.nik), nikLast4: sensitive.nik.slice(-4) });
  if (sensitive.ktpAddress !== undefined) out.ktpAddressEnc = encrypt(sensitive.ktpAddress);
  if (sensitive.bankAccount !== undefined) out.bankAccountEnc = encrypt(sensitive.bankAccount);
  if (sensitive.npwp !== undefined) out.npwpEnc = encrypt(sensitive.npwp);
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
  const { v, sensitive } = parsePersonnel(body, null, { user });
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
  for (const k of ['nik', 'ktpAddress', 'npwp', 'bankAccount', 'medicalHistory']) if (body[k] === '') delete body[k];
  delete body.siteId; // site berubah hanya melalui mutasi

  const { v, sensitive } = parsePersonnel(body, existing, { user });
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
  if (f.employmentType === 'NONE') where.employmentType = null;
  else if (f.employmentType && EMPLOYMENT_TYPES.includes(f.employmentType)) where.employmentType = f.employmentType;
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
        startDate: true, employmentType: true, contractEndDate: true,
        placements: { where: { endDate: { not: null } }, orderBy: { endDate: 'desc' }, take: 1, select: { endDate: true } },
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
      tenure: tenure(p.startDate, tenureEnd(p, now))?.label ?? null,
    })),
  };
}

// Masa kerja mantan personel dihitung sampai penempatan terakhir berakhir.
const tenureEnd = (p, now) => (p.isFormer && p.placements?.[0]?.endDate ? p.placements[0].endDate : now);

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
  const { nikEnc, nikHash, ktpAddressEnc, bankAccountEnc, medicalHistoryEnc, npwpEnc, ...rest } = p;
  void nikEnc; void nikHash; void ktpAddressEnc;
  const now = today();
  return {
    ...rest,
    nik: maskNik(p.nikLast4),
    npwp: ktp ? maskAccount(decrypt(npwpEnc)) : npwpEnc ? '[dibatasi]' : null,
    tenure: tenure(p.startDate, p.isFormer ? p.placements.find((x) => x.endDate)?.endDate ?? now : now),
    contractDaysLeft: p.employmentType === 'PKWT' && p.contractEndDate ? daysBetween(now, p.contractEndDate) : null,
    bankAccount: bank ? maskAccount(decrypt(bankAccountEnc)) : bankAccountEnc ? '[dibatasi]' : null,
    medicalHistory: medical ? decrypt(medicalHistoryEnc) : medicalHistoryEnc ? '[dibatasi]' : null,
    mcus: p.mcus.map(({ notesEnc, ...m }) => ({ ...m, notes: medical ? decrypt(notesEnc) : notesEnc ? '[dibatasi]' : null })),
    ktpFileId: ktp ? p.ktpFileId : null,
    access: { ktp, medical, bank },
    fitness: fitness(p.mcus.find((m) => m.isLatest), now),
  };
}

/** Tampilkan data sensitif utuh (dicatat di audit log). */
export async function revealSensitive(user, id, kind) {
  const p = await scopedPersonnel(user, id);
  const map = { KTP: ['KTP', () => ({ nik: decrypt(p.nikEnc), ktpAddress: decrypt(p.ktpAddressEnc), npwp: decrypt(p.npwpEnc) })], BANK: ['BANK', () => ({ bankAccount: decrypt(p.bankAccountEnc) })] };
  ensure(Object.hasOwn(map, kind), 'Jenis data tidak valid.');
  if (!canSeeSensitive(user, map[kind][0], p.currentSiteId)) throw new InputError('Anda tidak memiliki akses ke data ini.', 403);
  await audit(null, user, { action: 'VIEW_SENSITIVE', module: 'personnel', recordId: id, siteId: p.currentSiteId, note: kind });
  return map[kind][1]();
}

// ─── Import Excel: preview → tinjau → simpan ────────────────────────────────
const requiredMark = (req) => (req === true ? ' *' : '');

export function importTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(([, h, req]) => h + requiredMark(req))]);
  ws['!cols'] = IMPORT_COLUMNS.map(([, h]) => ({ wch: Math.max(16, h.length + 3) }));
  // Kolom identitas berupa teks agar Excel tidak mengubah 16 digit / menghapus angka 0 di depan.
  const textCols = new Set(['nik', 'npwp', 'bankAccount', 'phoneWa', 'emergencyPhone', 'bpjsKesehatan', 'bpjsKetenagakerjaan']);
  IMPORT_COLUMNS.forEach(([field], c) => {
    if (!textCols.has(field)) return;
    for (let r = 1; r <= 1000; r++) ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: '', z: '@' };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: IMPORT_COLUMNS.length - 1 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Personel');
  const info = XLSX.utils.aoa_to_sheet([
    ['Petunjuk'],
    ['Kolom bertanda * wajib diisi: ' + IMPORT_COLUMNS.filter(([, , r]) => r === true).map(([, h]) => h.replace(/\s*\(.*\)/, '')).join(', ') + '.'],
    ['Kolom lain boleh dikosongkan (atau diisi "-"), termasuk Nama Bank & No Rekening untuk semua kategori.'],
    ['Isian rekening yang tidak valid tidak menggagalkan baris: rekening dilewati dan diberi peringatan, lengkapi kemudian lewat Edit personel.'],
    ['Tanggal boleh YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, atau format tanggal Excel.'],
    ['Format kolom NIK, NPWP dan No Rekening sebagai Text agar digit tidak berubah (template ini sudah diatur).'],
    ['Kategori: STAFF / MANPOWER / HARIAN_KANTOR. Jenis kelamin: L/P (Laki-laki/Perempuan). Status nikah: Menikah / Belum menikah / Cerai.'],
    ['Status Kepegawaian: PKWT (kontrak) / PKWTT (tetap) — hanya diproses bila import dilakukan oleh HRD / HO HSE. Akhir Kontrak hanya untuk PKWT.'],
    ['NPWP 15 digit (format lama) atau 16 digit (NIK/NPWP baru); titik dan strip boleh disertakan.'],
    ['Kode Site mengacu Master Site. Kode Mandor = kode personel PJM-xxxxxx (opsional, khusus manpower).'],
    ['NIK yang sudah terdaftar tidak akan membuat profil baru.'],
  ]);
  info['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function validateImport(user, rawRows) {
  ensure(Array.isArray(rawRows) && rawRows.length > 0 && rawRows.length <= 1000, 'Import 1–1000 baris per file.');
  const sites = await prisma.site.findMany({ select: { id: true, code: true } });
  const siteByCode = Object.fromEntries(sites.map((s) => [s.code.toUpperCase(), s.id]));
  const seen = new Map();
  const results = [];
  const mapped = rawRows.map((r) => mapImportRow(r && typeof r === 'object' ? r : {}));
  const foremanCodes = [...new Set(mapped.map((r) => r.foremanCode).filter(Boolean).map((c) => String(c).trim().toUpperCase()))];
  const foremen = await prisma.personnel.findMany({ where: { code: { in: foremanCodes } }, select: { id: true, code: true } });
  const foremanByCode = Object.fromEntries(foremen.map((f) => [f.code, f.id]));
  for (const [index, row] of mapped.entries()) {
    const { body: normalized, errors, warnings } = normalizeImportRow(row);
    const { siteCode, foremanCode, ...body } = normalized;
    // Rekening tidak pernah menggagalkan baris import: isian yang tidak valid dilewati dengan peringatan.
    for (const [k, label, check] of [
      ['bankName', 'Nama bank', (x) => x.length <= 60],
      ['bankAccount', 'No rekening', (x) => /^\d{5,30}$/.test(x)],
      ['bankAccountName', 'Nama pemilik rekening', (x) => x.length <= 120],
    ]) {
      if (body[k] && !check(body[k])) {
        delete body[k];
        warnings.push(`${label} tidak valid — tidak diimpor.`);
      }
    }
    if (!canSetEmployment(user) && (body.employmentType || body.contractEndDate)) {
      delete body.employmentType;
      delete body.contractEndDate;
      warnings.push('Status kepegawaian diabaikan (hanya HRD / HO HSE yang dapat mengisi).');
    }
    let parsed = null;
    const siteId = siteByCode[String(siteCode ?? '').toUpperCase()];
    if (!siteCode) errors.push('Kode site wajib diisi.');
    else if (!siteId) errors.push(`Kode site "${siteCode}" tidak dikenal.`);
    else {
      try {
        requireSite(user, siteId);
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (foremanCode) {
      const fid = foremanByCode[foremanCode.toUpperCase()];
      if (fid) body.foremanId = fid;
      else errors.push(`Kode mandor "${foremanCode}" tidak ditemukan.`);
    }
    const result = parsePersonnel(body, null, { user, errors, requireBank: false });
    if (!errors.length) parsed = { ...result, siteId };
    let duplicate = null;
    if (parsed) {
      const nik = parsed.sensitive.nik;
      if (seen.has(nik)) errors.push(`NIK ganda dengan baris ${seen.get(nik) + 2}.`);
      seen.set(nik, index);
      const dup = await prisma.personnel.findUnique({ where: { nikHash: lookupHash(nik) }, select: { code: true } });
      if (dup) duplicate = dup.code;
    }
    results.push({ row: index + 2, name: body.name ?? '-', nik: body.nik ? maskNik(String(body.nik).slice(-4)) : '-', siteCode: siteCode ?? '-', category: body.category ?? '-', errors, warnings, duplicate, parsed });
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
    include: {
      currentSite: { select: { code: true } }, foreman: { select: { code: true } },
      placements: { where: { endDate: { not: null } }, orderBy: { endDate: 'desc' }, take: 1, select: { endDate: true } },
    },
  });
  const now = today();
  const ktpAll = siteScope(user) === null && canSeeSensitive(user, 'KTP');
  const data = rows.map((p) => {
    const ktp = ktpAll || canSeeSensitive(user, 'KTP', p.currentSiteId);
    return {
      Kode: p.code, NIK: ktp ? decrypt(p.nikEnc) : maskNik(p.nikLast4), Nama: p.name, 'Tempat Lahir': p.birthPlace, 'Tanggal Lahir': iso(p.birthDate),
      'Jenis Kelamin': p.gender, 'Status Nikah': p.maritalStatus, Pendidikan: p.education, Jurusan: p.major, 'No WA': p.phoneWa,
      'Kontak Darurat': p.emergencyName, 'No Kontak Darurat': p.emergencyPhone, 'Alamat KTP': ktp ? decrypt(p.ktpAddressEnc) : '[dibatasi]',
      'Alamat Domisili': p.domicileAddress, 'Asal Daerah': p.originRegion, Kategori: p.category, Jabatan: p.position, Site: p.currentSite?.code,
      'Tanggal Mulai': iso(p.startDate), 'Masa Kerja': tenure(p.startDate, tenureEnd(p, now))?.label ?? '',
      'Status Kepegawaian': p.employmentType, 'Akhir Kontrak': iso(p.contractEndDate), 'Status Kerja': p.workStatus,
      NPWP: p.npwpEnc ? (ktp ? decrypt(p.npwpEnc) : '[dibatasi]') : '', 'BPJS Kesehatan': p.bpjsKesehatan, 'BPJS Ketenagakerjaan': p.bpjsKetenagakerjaan,
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
