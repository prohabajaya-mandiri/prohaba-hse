export const CATEGORIES = ['STAFF', 'MANPOWER', 'HARIAN_KANTOR'];
export const CATEGORY_LABELS = { STAFF: 'Staff', MANPOWER: 'Manpower', HARIAN_KANTOR: 'Harian Kantor' };
export const WORK_STATUSES = ['ACTIVE', 'CUTI', 'SAKIT', 'MCU', 'RESIGN', 'DIRUMAHKAN', 'MUTASI'];
export const MARITAL = ['MENIKAH', 'BELUM_MENIKAH', 'CERAI'];
export const MARITAL_LABELS = { MENIKAH: 'Menikah', BELUM_MENIKAH: 'Belum menikah', CERAI: 'Cerai' };
export const BLOOD_TYPES = ['A', 'B', 'AB', 'O'];
export const INACTIVE_STATUSES = ['RESIGN'];

// Status kepegawaian sesuai UU Ketenagakerjaan / PP 35/2021:
// PKWT = kontrak waktu tertentu (memiliki tanggal akhir kontrak), PKWTT = karyawan tetap.
export const EMPLOYMENT_TYPES = ['PKWT', 'PKWTT'];
export const EMPLOYMENT_LABELS = { PKWT: 'PKWT (Kontrak)', PKWTT: 'PKWTT (Tetap)' };
export const CONTRACT_WARNING_DAYS = 30;

/** Masa kerja dari tanggal mulai sampai `end` (default hari ini). null bila belum ada/ belum mulai. */
export function tenure(start, end = new Date()) {
  if (!start) return null;
  const a = new Date(start), b = new Date(end);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b < a) return null;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  const anchor = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + months, 1));
  anchor.setUTCDate(Math.min(a.getUTCDate(), new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate()));
  const days = Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - anchor.getTime()) / 86400000);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years && `${years} tahun`, rest && `${rest} bulan`].filter(Boolean);
  return { years, months: rest, totalMonths: months, days, label: parts.length ? parts.join(' ') : `${days} hari` };
}

// Kolom template import Excel standar: [field, header, wajib, alias header lain].
// Header dicocokkan tanpa memperhatikan huruf besar/kecil, spasi, tanda baca, dan teks dalam kurung.
// wajib: true = selalu wajib; 'STAFF' = wajib hanya untuk kategori STAFF.
export const IMPORT_COLUMNS = [
  ['nik', 'NIK', true, ['No KTP', 'Nomor KTP', 'NIK KTP']],
  ['name', 'Nama', true, ['Nama Lengkap', 'Nama Karyawan', 'Nama Personel']],
  ['birthPlace', 'Tempat Lahir'],
  ['birthDate', 'Tanggal Lahir (YYYY-MM-DD)', false, ['Tgl Lahir']],
  ['gender', 'Jenis Kelamin (L/P)', false, ['JK', 'Gender', 'L/P']],
  ['maritalStatus', 'Status Nikah (MENIKAH/BELUM_MENIKAH/CERAI)', false, ['Status Pernikahan', 'Status Perkawinan', 'Status Kawin']],
  ['education', 'Pendidikan', false, ['Pendidikan Terakhir']],
  ['major', 'Jurusan'],
  ['phoneWa', 'No WA', false, ['No HP', 'No Telepon', 'No Telp', 'Nomor WA', 'WhatsApp', 'No WhatsApp']],
  ['emergencyName', 'Kontak Darurat', false, ['Nama Kontak Darurat']],
  ['emergencyPhone', 'No Kontak Darurat', false, ['No HP Kontak Darurat', 'Telepon Kontak Darurat']],
  ['emergencyRelation', 'Hubungan Kontak Darurat', false, ['Hubungan']],
  ['ktpAddress', 'Alamat KTP', true, ['Alamat', 'Alamat Sesuai KTP']],
  ['domicileAddress', 'Alamat Domisili', false, ['Domisili']],
  ['originRegion', 'Asal Daerah'],
  ['category', 'Kategori (STAFF/MANPOWER/HARIAN_KANTOR)', true],
  ['position', 'Jabatan', true, ['Posisi']],
  ['siteCode', 'Kode Site', true, ['Site']],
  ['startDate', 'Tanggal Mulai (YYYY-MM-DD)', false, ['Tanggal Masuk', 'Tgl Masuk', 'Tanggal Bergabung', 'TMT', 'Tgl Mulai']],
  ['employmentType', 'Status Kepegawaian (PKWT/PKWTT)', false, ['Status Karyawan', 'Status Kontrak', 'PKWT/PKWTT']],
  ['contractEndDate', 'Akhir Kontrak PKWT (YYYY-MM-DD)', false, ['Akhir Kontrak', 'Tanggal Akhir Kontrak', 'Tgl Akhir Kontrak']],
  ['npwp', 'NPWP', false, ['No NPWP', 'Nomor NPWP']],
  ['bpjsKesehatan', 'BPJS Kesehatan'],
  ['bpjsKetenagakerjaan', 'BPJS Ketenagakerjaan', false, ['BPJS TK']],
  ['bloodType', 'Golongan Darah', false, ['Gol Darah']],
  ['shirtSize', 'Ukuran Baju'],
  ['shoeSize', 'Ukuran Sepatu'],
  ['bankName', 'Nama Bank (wajib untuk STAFF)', 'STAFF', ['Bank']],
  ['bankAccount', 'No Rekening (wajib untuk STAFF)', 'STAFF', ['Nomor Rekening', 'Rekening']],
  ['bankAccountName', 'Nama Pemilik Rekening', false, ['Atas Nama Rekening']],
  ['foremanCode', 'Kode Mandor', false, ['Mandor']],
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Petakan baris Excel (object header→nilai) ke field internal. Angka dipertahankan sebagai number. */
export function mapImportRow(raw) {
  const lookup = new Map(Object.entries(raw).map(([k, v]) => [norm(k), v]));
  const row = {};
  for (const [field, header, , aliases = []] of IMPORT_COLUMNS) {
    const key = [header, field, ...aliases].map(norm).find((k) => lookup.has(k) && !isBlank(lookup.get(k)));
    if (key === undefined) continue;
    const v = lookup.get(key);
    row[field] = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? v : String(v).trim();
  }
  return row;
}

// Isian "kosong" yang lazim di Excel. Kolom opsional berisi nilai ini dianggap tidak diisi.
const BLANKS = new Set(['', '-', '--', '---', '.', '–', '—', '_', '0000-00-00', 'NA', 'N/A', 'NULL', 'NIL', 'NONE', 'KOSONG', 'TIDAK ADA', 'BELUM ADA', 'TIDAK TAHU', 'TIDAK TAU', 'BELUM TAHU', '?']);
const isBlank = (v) => v === undefined || v === null || BLANKS.has(String(v).trim().toUpperCase());

const MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, nopember: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12 };
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += y > (new Date().getUTCFullYear() % 100) + 1 ? 1900 : 2000;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/**
 * Normalisasi tanggal dari Excel ke YYYY-MM-DD. Mendukung serial tanggal Excel, YYYY-MM-DD,
 * DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (urutan hari-bulan Indonesia) dan "15 Agustus 1990".
 * Nilai yang tidak dikenali dikembalikan apa adanya agar validator memberi pesan yang jelas.
 */
export function normalizeDate(v) {
  // Serial tanggal Excel (10000 = 1927-05-18, 2958465 = 9999-12-31).
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Math.floor(Number(v));
    if (n >= 10000 && n < 2958466) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return ymd(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)\.?[\s-]+(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  return s;
}

const letters = (v) => String(v).toUpperCase().replace(/[^A-Z]/g, '');
const GENDER = { L: 'L', LK: 'L', LAKI: 'L', LAKILAKI: 'L', PRIA: 'L', M: 'L', MALE: 'L', P: 'P', PR: 'P', PEREMPUAN: 'P', WANITA: 'P', W: 'P', F: 'P', FEMALE: 'P' };
const CATEGORY = { STAFF: 'STAFF', STAF: 'STAFF', MANPOWER: 'MANPOWER', HARIANKANTOR: 'HARIAN_KANTOR', HARIAN: 'HARIAN_KANTOR' };
const EMPLOYMENT = { PKWT: 'PKWT', KONTRAK: 'PKWT', PKWTT: 'PKWTT', TETAP: 'PKWTT', KARYAWANTETAP: 'PKWTT' };
function marital(v) {
  const s = letters(v);
  if (/^(BELUM|LAJANG|SINGLE|TK$)/.test(s)) return 'BELUM_MENIKAH';
  if (/^(CERAI|JANDA|DUDA|DIVORCE)/.test(s)) return 'CERAI';
  if (/^(MENIKAH|KAWIN|SUDAHMENIKAH|SUDAHKAWIN|MARRIED|K$|K\d)/.test(s)) return 'MENIKAH';
  return String(v).toUpperCase().replace(/\s+/g, '_');
}
const digits = (v) => String(v).replace(/[\s.\-/]/g, '');

/**
 * Normalisasi isian bebas dari Excel sebelum divalidasi: tanggal, L/P, status nikah, kategori,
 * golongan darah, nomor telepon, rekening, NPWP. Mengembalikan { body, errors }.
 */
export function normalizeImportRow(row) {
  const body = {};
  const errors = [];
  for (const [k, v] of Object.entries(row)) {
    if (isBlank(v)) continue;
    body[k] = typeof v === 'number' ? String(v) : String(v).trim();
  }
  // 16 digit yang tersimpan sebagai angka di Excel kehilangan digit terakhir (presisi Excel 15 digit).
  for (const [k, label] of [['nik', 'NIK'], ['npwp', 'NPWP'], ['bankAccount', 'No rekening']]) {
    if (typeof row[k] === 'number' && String(row[k]).length >= 16 && String(row[k]).endsWith('0')) {
      errors.push(`${label} tersimpan sebagai angka di Excel sehingga digit terakhir berubah. Format kolom ${label} sebagai Text lalu ketik ulang.`);
      delete body[k];
    }
  }
  if (body.nik) body.nik = body.nik.replace(/\s/g, '');
  for (const k of ['birthDate', 'startDate', 'contractEndDate']) if (body[k]) body[k] = normalizeDate(row[k]);
  if (body.gender) body.gender = GENDER[letters(body.gender)] ?? body.gender;
  if (body.maritalStatus) body.maritalStatus = marital(body.maritalStatus);
  if (body.category) body.category = CATEGORY[letters(body.category)] ?? body.category.toUpperCase();
  if (body.employmentType) body.employmentType = EMPLOYMENT[letters(body.employmentType)] ?? body.employmentType.toUpperCase();
  if (body.bloodType) body.bloodType = body.bloodType.toUpperCase().replace(/RH|POS(ITIF)?|NEG(ATIF)?|[\s+\-]/g, '') || null;
  for (const k of ['phoneWa', 'emergencyPhone']) {
    // Nomor berawalan 0 yang diketik sebagai angka kehilangan angka 0 di depan.
    if (body[k] && /^8\d{7,12}$/.test(body[k])) body[k] = '0' + body[k];
  }
  if (body.bankAccount) body.bankAccount = digits(body.bankAccount);
  if (body.npwp) body.npwp = digits(body.npwp);
  for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
  return { body, errors };
}

// ─── OCR KTP: hasil hanya saran, wajib diverifikasi manual ──────────────────
export function parseKtpText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const after = (re) => {
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return null;
    const v = lines[i].replace(re, '').replace(/^[\s:.=-]+/, '').trim();
    return v || lines[i + 1] || null;
  };
  const digits = String(text).replace(/[OoD]/g, '0').replace(/[Il|]/g, '1').match(/\d{16}/);
  const ttl = after(/^tempat\s*\/?\s*tgl\.?\s*lahir/i);
  let birthPlace = null, birthDate = null;
  if (ttl) {
    const m = ttl.match(/^(.*?)[,.\s]+(\d{2})[-/.](\d{2})[-/.](\d{4})/);
    if (m) {
      birthPlace = m[1].trim() || null;
      birthDate = `${m[4]}-${m[3]}-${m[2]}`;
    }
  }
  const genderLine = after(/^jenis\s*kelamin/i) ?? '';
  const status = (after(/^status\s*perkawinan/i) ?? '').toUpperCase();
  return {
    nik: digits?.[0] ?? null,
    name: after(/^nama/i)?.replace(/[^A-Za-z.,' ]/g, '').trim() || null,
    birthPlace,
    birthDate,
    gender: /PEREMPUAN/i.test(genderLine) ? 'P' : /LAKI/i.test(genderLine) ? 'L' : null,
    ktpAddress: [after(/^alamat/i), after(/^rt\s*\/?\s*rw/i) && 'RT/RW ' + after(/^rt\s*\/?\s*rw/i), after(/^kel\s*\/?\s*desa/i), after(/^kecamatan/i)]
      .filter(Boolean)
      .join(', ') || null,
    maritalStatus: status.includes('BELUM') ? 'BELUM_MENIKAH' : status.includes('CERAI') ? 'CERAI' : status.includes('KAWIN') ? 'MENIKAH' : null,
  };
}
