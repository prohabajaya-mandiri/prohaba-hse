// Kode MANPOWER dipertahankan (dipakai data lama & API integrasi ERP Center); tampil sebagai "Harian Mandor".
export const CATEGORIES = ['STAFF', 'HARIAN_KANTOR', 'MANPOWER'];
export const CATEGORY_LABELS = { STAFF: 'Staff', HARIAN_KANTOR: 'Harian Kantor', MANPOWER: 'Harian Mandor' };
/** Terima kode maupun label kategori (mis. "Harian Mandor" / HARIAN_MANDOR → MANPOWER). */
export function normalizeCategory(v) {
  if (v === undefined || v === null || v === '') return v;
  const key = String(v).toUpperCase().replace(/[^A-Z]/g, '');
  return CATEGORY_ALIASES[key] ?? String(v).toUpperCase();
}
const CATEGORY_ALIASES = { STAFF: 'STAFF', STAF: 'STAFF', HARIANKANTOR: 'HARIAN_KANTOR', HARIANMANDOR: 'MANPOWER', MANPOWER: 'MANPOWER' };
export const WORK_STATUSES = ['ACTIVE', 'CUTI', 'SAKIT', 'MCU', 'RESIGN', 'PHK', 'DIRUMAHKAN', 'MUTASI'];
export const MARITAL = ['MENIKAH', 'BELUM_MENIKAH', 'CERAI'];
export const MARITAL_LABELS = { MENIKAH: 'Menikah', BELUM_MENIKAH: 'Belum menikah', CERAI: 'Cerai' };
export const BLOOD_TYPES = ['A', 'B', 'AB', 'O'];
// Status yang menjadikan personel "mantan" (isFormer).
export const INACTIVE_STATUSES = ['RESIGN', 'PHK'];

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
// wajib: true = wajib diisi. Kolom rekening selalu opsional pada import (boleh dilengkapi kemudian).
export const IMPORT_COLUMNS = [
  ['nik', 'NIK', true, ['No KTP', 'Nomor KTP', 'NIK KTP']],
  ['nip', 'NIP', false, ['Nomor Induk Pegawai', 'No Induk Pegawai', 'NIP Karyawan', 'No Pegawai']],
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
  ['category', 'Kategori (Staff/Harian Kantor/Harian Mandor)', true],
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
  ['bankName', 'Nama Bank', false, ['Bank']],
  ['bankAccount', 'No Rekening', false, ['Nomor Rekening', 'Rekening']],
  ['bankAccountName', 'Nama Pemilik Rekening', false, ['Atas Nama Rekening']],
  ['foremanRef', 'NIP Mandor', false, ['Mandor', 'Kode Mandor']],
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
 * golongan darah, nomor telepon, rekening, NPWP. Mengembalikan { body, errors, warnings }.
 */
export function normalizeImportRow(row) {
  const body = {};
  const errors = [];
  const warnings = [];
  for (const [k, v] of Object.entries(row)) {
    if (isBlank(v)) continue;
    body[k] = typeof v === 'number' ? String(v) : String(v).trim();
  }
  // 16 digit yang tersimpan sebagai angka di Excel kehilangan digit terakhir (presisi Excel 15 digit).
  for (const [k, label] of [['nik', 'NIK'], ['npwp', 'NPWP'], ['bankAccount', 'No rekening']]) {
    if (typeof row[k] === 'number' && String(row[k]).length >= 16 && String(row[k]).endsWith('0')) {
      // Rekening opsional: nilai yang rusak dilewati tanpa menggagalkan baris.
      (k === 'bankAccount' ? warnings : errors).push(`${label} tersimpan sebagai angka di Excel sehingga digit terakhir berubah${k === 'bankAccount' ? ' — rekening tidak diimpor' : ''}. Format kolom ${label} sebagai Text lalu ketik ulang.`);
      delete body[k];
    }
  }
  if (body.nik) body.nik = body.nik.replace(/\s/g, '');
  for (const k of ['birthDate', 'startDate', 'contractEndDate']) if (body[k]) body[k] = normalizeDate(row[k]);
  if (body.gender) body.gender = GENDER[letters(body.gender)] ?? body.gender;
  if (body.maritalStatus) body.maritalStatus = marital(body.maritalStatus);
  if (body.category) body.category = normalizeCategory(body.category);
  if (body.employmentType) body.employmentType = EMPLOYMENT[letters(body.employmentType)] ?? body.employmentType.toUpperCase();
  if (body.bloodType) body.bloodType = body.bloodType.toUpperCase().replace(/RH|POS(ITIF)?|NEG(ATIF)?|[\s+\-]/g, '') || null;
  for (const k of ['phoneWa', 'emergencyPhone']) {
    // Nomor berawalan 0 yang diketik sebagai angka kehilangan angka 0 di depan.
    if (body[k] && /^8\d{7,12}$/.test(body[k])) body[k] = '0' + body[k];
  }
  if (body.bankAccount) body.bankAccount = digits(body.bankAccount);
  if (body.npwp) body.npwp = digits(body.npwp);
  for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
  return { body, errors, warnings };
}

// ─── OCR KTP: hasil hanya saran, wajib diverifikasi manual ──────────────────
// Kode provinsi = 2 digit awal NIK. Dipakai memvalidasi NIK dan menormalkan nama provinsi di kepala KTP.
export const PROVINCES = {
  11: 'ACEH', 12: 'SUMATERA UTARA', 13: 'SUMATERA BARAT', 14: 'RIAU', 15: 'JAMBI', 16: 'SUMATERA SELATAN', 17: 'BENGKULU', 18: 'LAMPUNG',
  19: 'KEPULAUAN BANGKA BELITUNG', 21: 'KEPULAUAN RIAU', 31: 'DKI JAKARTA', 32: 'JAWA BARAT', 33: 'JAWA TENGAH', 34: 'DI YOGYAKARTA',
  35: 'JAWA TIMUR', 36: 'BANTEN', 51: 'BALI', 52: 'NUSA TENGGARA BARAT', 53: 'NUSA TENGGARA TIMUR', 61: 'KALIMANTAN BARAT',
  62: 'KALIMANTAN TENGAH', 63: 'KALIMANTAN SELATAN', 64: 'KALIMANTAN TIMUR', 65: 'KALIMANTAN UTARA', 71: 'SULAWESI UTARA',
  72: 'SULAWESI TENGAH', 73: 'SULAWESI SELATAN', 74: 'SULAWESI TENGGARA', 75: 'GORONTALO', 76: 'SULAWESI BARAT', 81: 'MALUKU',
  82: 'MALUKU UTARA', 91: 'PAPUA', 92: 'PAPUA BARAT', 93: 'PAPUA SELATAN', 94: 'PAPUA TENGAH', 95: 'PAPUA PEGUNUNGAN', 96: 'PAPUA BARAT DAYA',
};
// Penulisan lain yang masih tercetak di KTP lama.
const PROVINCE_ALIASES = { NANGGROEACEHDARUSSALAM: '11', DAERAHISTIMEWAYOGYAKARTA: '34', DAERAHKHUSUSIBUKOTAJAKARTA: '31', BANGKABELITUNG: '19' };

const validYmd = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/**
 * Uraikan NIK (PP KK CC DDMMYY SSSS; tanggal lahir perempuan ditambah 40).
 * Mengembalikan { province, birthDate, gender } atau null bila struktur NIK tidak sah.
 */
export function nikInfo(nik, today = new Date()) {
  const m = /^(\d{2})\d{4}(\d{2})(\d{2})(\d{2})(\d{4})$/.exec(String(nik ?? ''));
  if (!m || !PROVINCES[m[1]] || m[5] === '0000') return null;
  const code = Number(m[2]), month = Number(m[3]);
  const day = code > 40 ? code - 40 : code;
  // Tahun dua digit: karyawan berumur minimal ±14 tahun, jadi 20xx yang terlalu muda berarti 19xx.
  let year = 2000 + Number(m[4]);
  if (year > today.getUTCFullYear() - 14) year -= 100;
  if (!validYmd(year, month, day)) return null;
  return { province: m[1], birthDate: `${year}-${pad(month)}-${pad(day)}`, gender: code > 40 ? 'P' : 'L' };
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// [kunci, label tanpa spasi/tanda baca, toleransi salah baca huruf].
const KTP_LABELS = [
  ['nik', 'nik', 0], ['name', 'nama', 1], ['ttl', 'tempattgllahir', 3], ['gender', 'jeniskelamin', 3], ['street', 'alamat', 1],
  ['rtrw', 'rtrw', 1], ['village', 'keldesa', 2], ['district', 'kecamatan', 2], ['religion', 'agama', 1], ['marital', 'statusperkawinan', 4],
  ['job', 'pekerjaan', 2], ['citizenship', 'kewarganegaraan', 3], ['validUntil', 'berlakuhingga', 3],
];

/** Cocokkan awal baris dengan label meski huruf salah baca / tanda ":" hilang. Mengembalikan { d, rest } atau null. */
function matchPrefix(line, label, tol) {
  const at = [];
  for (let i = 0; i < line.length && at.length < label.length + tol; i++) if (/[A-Za-z]/.test(line[i])) at.push(i);
  const letters = at.map((i) => line[i].toLowerCase()).join('');
  let best = null;
  for (let m = Math.max(1, label.length - tol); m <= Math.min(letters.length, label.length + tol); m++) {
    // Label pendek wajib berdiri sendiri agar nilai seperti "NIKMAT" atau "ALAMANDA" tidak dianggap label.
    if (label.length <= 6 && /[A-Za-z]/.test(line[at[m - 1] + 1] ?? '')) continue;
    const d = editDistance(letters.slice(0, m), label);
    // Sisa huruf kecil = ekor label (nilai KTP selalu huruf besar).
    if (d <= tol && (!best || d < best.d)) best = { d, rest: line.slice(at[m - 1] + 1).replace(/^[a-z]+/, '') };
  }
  return best;
}

function matchLabel(line) {
  // Bila ada ":" di awal baris, label = huruf sebelum ":"; bila tidak (sering hilang/terbaca lain), cocokkan awalan.
  const colon = line.search(/[:;]/);
  let best = null;
  if (colon > 0 && colon <= 30) {
    const head = line.slice(0, colon).toLowerCase().replace(/[^a-z]/g, '');
    for (const [key, label, tol] of KTP_LABELS) {
      const d = editDistance(head, label);
      if (d <= tol && (!best || d < best.d)) best = { key, d, value: line.slice(colon + 1) };
    }
    if (best) return best;
  }
  for (const [key, label, tol] of KTP_LABELS) {
    const hit = matchPrefix(line, label, tol);
    if (hit && (!best || hit.d < best.d)) best = { key, d: hit.d, value: hit.rest };
  }
  return best;
}

// Isi kolom: buang pemisah di depan, lalu potong pada celah lebar (teks kolom kanan: foto, gol. darah, tempat terbit).
const cell = (v) => String(v ?? '').replace(/^[\s:;.,=\-–—_'"“”‘’`|~*]+/, '').split(/\s{3,}/)[0].trim();
const cleanText = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9 .,'/()-]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.,'/-]+|[\s,'/-]+$/g, '');
// Nama orang/tempat tidak memuat angka: angka hasil salah baca dikembalikan ke huruf yang mirip.
const LOOKALIKE_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 8: 'B' };
const cleanWords = (v) => {
  const s = cleanText(String(v ?? '').toUpperCase().replace(/\d/g, (d) => LOOKALIKE_LETTER[d] ?? ' ')).replace(/[^A-Z .,'-]/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').replace(/^[\s.,'-]+|[\s,'-]+$/g, '');
  return (s.match(/[A-Z]/g) ?? []).length >= 2 ? s : null;
};
const LOOKALIKE_DIGIT = { O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', i: '1', L: '1', '|': '1', '!': '1', ']': '1', '[': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', T: '7', '?': '7', A: '4' };
const toDigits = (v) => [...String(v)].map((c) => LOOKALIKE_DIGIT[c] ?? c).join('');

function nikCandidates(v, lenient) {
  const s = lenient ? toDigits(String(v).replace(/\s/g, '')) : String(v).replace(/[\s.-]/g, '');
  const out = [];
  for (const run of s.match(/\d{16,}/g) ?? []) for (let k = 0; k + 16 <= run.length; k++) out.push(run.slice(k, k + 16));
  return out;
}

function parseTtl(v) {
  const s = String(v).toUpperCase();
  const m = s.match(/(\d[\dOIL|]?)\s*[-./, ]+\s*([\dOIL|]{1,2})\s*[-./, ]+\s*([12][\dOILSB|]{3})(?![\d])/) ?? s.match(/(\d{2})(\d{2})((?:19|20)\d{2})/);
  if (!m) return { place: cleanWords(s), date: null };
  const [d, mo, y] = [m[1], m[2], m[3]].map((x) => Number(toDigits(x)));
  const ok = validYmd(y, mo, d) && y >= 1900 && y <= new Date().getUTCFullYear();
  return { place: cleanWords(s.slice(0, m.index)), date: ok ? `${y}-${pad(mo)}-${pad(d)}` : null };
}

function parseRtRw(v) {
  const s = String(v).replace(/[Oo]/g, '0');
  const m = s.match(/^\D*(\d{1,3})\s*[/\\|Il!]\s*(\d{1,3})\D*$/);
  if (m) return `${m[1].padStart(3, '0')}/${m[2].padStart(3, '0')}`;
  const d = s.replace(/\D/g, '');
  if (d.length === 6) return `${d.slice(0, 3)}/${d.slice(3)}`;
  if (d.length === 7 && d[3] === '1') return `${d.slice(0, 3)}/${d.slice(4)}`; // "/" terbaca "1"
  return cleanText(s) || null;
}

function matchProvince(text) {
  const s = letters(text);
  if (s.length < 3) return null;
  let best = null;
  const names = [...Object.entries(PROVINCES).map(([code, n]) => [code, letters(n)]), ...Object.entries(PROVINCE_ALIASES).map(([n, code]) => [code, n])];
  for (const [code, name] of names) {
    const d = editDistance(s, name);
    if (d <= Math.floor(name.length / 5) && (!best || d < best.d)) best = { code, d };
  }
  return best?.code ?? null;
}

/** Uraikan satu teks hasil OCR KTP menjadi nilai mentah per kolom. */
function extractKtp(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found = [];
  lines.forEach((line, index) => {
    const hit = matchLabel(line);
    if (hit) found.push({ ...hit, index, value: cell(hit.value) });
  });
  const isLabel = (i) => found.some((f) => f.index === i);
  // Nilai kosong: ambil baris berikutnya; bila tata letak terbaca dua kolom (semua label lalu semua nilai),
  // pasangkan label kosong dengan baris berawalan ":" sesuai urutan.
  for (const f of found) {
    const next = lines[f.index + 1];
    if (!f.value && next && !isLabel(f.index + 1) && !/^[:;]/.test(next)) Object.assign(f, { value: cell(next), usedNext: true });
  }
  const orphans = lines.map((l, i) => (!isLabel(i) && i > (found[0]?.index ?? Infinity) && /^[:;]/.test(l) ? cell(l) : null)).filter((v) => v !== null);
  found.filter((f) => !f.value).forEach((f, k) => { f.value = orphans[k] ?? ''; });
  const get = (key) => found.find((f) => f.key === key);
  const val = (key) => get(key)?.value ?? '';

  // Alamat panjang berlanjut ke baris tanpa label sebelum RT/RW.
  let street = cleanText(val('street'));
  const st = get('street');
  if (st) {
    const next = found.find((f) => f.index > st.index)?.index ?? lines.length;
    for (let j = st.index + (st.usedNext ? 2 : 1); j < Math.min(next, st.index + 3); j++) {
      const more = cleanText(cell(lines[j]));
      if (!/^[:;]/.test(lines[j]) && /[A-Z]{2}/.test(more) && !/^\d{2}[-.]\d{2}[-.]\d{4}$/.test(more)) street = `${street} ${more}`.trim();
    }
  }

  // Kepala KTP: "PROVINSI ..." lalu baris kabupaten/kota.
  let province = null, regency = null;
  const pi = lines.findIndex((l) => matchPrefix(l, 'provinsi', 2));
  if (pi >= 0) {
    province = matchProvince(matchPrefix(lines[pi], 'provinsi', 2).rest);
    const next = lines[pi + 1];
    if (next && !isLabel(pi + 1)) regency = cleanWords(cell(next.replace(/^(\S\s+)+/, '')));
  }

  const ttl = parseTtl(val('ttl'));
  const nikLine = get('nik');
  const nikCands = nikLine ? nikCandidates(nikLine.value, true) : [];
  if (!nikCands.length) for (const l of lines) nikCands.push(...nikCandidates(l, false));
  const genderText = letters(val('gender'));
  const maritalText = letters(val('marital'));
  const blood = lines.join('\n').match(/D[A4]R[A4]H\s*[:;.=-]*\s*(AB|A|B|O|0)(?![A-Z0-9])/i)?.[1].toUpperCase().replace('0', 'O') ?? null;
  return {
    labels: found.length,
    nikCands,
    name: cleanWords(val('name')),
    birthPlace: ttl.place,
    birthDate: ttl.date,
    gender: /PEREM|EREMP|EMPUA|MPUAN|WANITA/.test(genderText) ? 'P' : /LAK|AKIL|KILA|PRIA/.test(genderText) ? 'L' : null,
    maritalStatus: /BEL|ELUM|BLM|LUM/.test(maritalText) ? 'BELUM_MENIKAH' : /CER|ERAI|RAI/.test(maritalText) ? 'CERAI' : /KAW|AWIN|WIN/.test(maritalText) ? 'MENIKAH' : null,
    bloodType: blood,
    street: street || null,
    rtrw: val('rtrw') ? parseRtRw(val('rtrw')) : null,
    village: cleanWords(val('village')),
    district: cleanWords(val('district')),
    province,
    regency,
  };
}

// Perbaikan satu digit NIK yang strukturnya tidak sah, memakai provinsi di kepala KTP dan tanggal lahir/jenis kelamin.
function nikRepairs(nik, province, birthDate, gender) {
  const out = [];
  const head = province && nik.slice(0, 2) !== province && editDistance(nik.slice(0, 2), province) === 1 ? province : nik.slice(0, 2);
  let born = nik.slice(6, 12);
  if (birthDate && gender) {
    const [y, m, d] = birthDate.split('-');
    const expected = pad(Number(d) + (gender === 'P' ? 40 : 0)) + m + y.slice(2);
    if ([...expected].filter((c, i) => c !== born[i]).length === 1) born = expected;
  }
  const fixed = head + nik.slice(2, 6) + born + nik.slice(12);
  if (fixed !== nik) out.push(fixed);
  return out;
}

const dmy = (iso) => iso.split('-').reverse().join('-');

/**
 * Uraikan teks OCR KTP (satu teks atau beberapa hasil baca dari gambar yang sama) menjadi saran isian form.
 * NIK dipilih dari kandidat yang strukturnya sah dan dicocokkan silang dengan tanggal lahir & jenis kelamin.
 * Mengembalikan { fields, warnings, complete, labels }; fields berisi null untuk kolom yang tidak terbaca.
 */
export function parseKtp(texts, today = new Date()) {
  const raws = [].concat(texts).map(extractKtp).sort((a, b) => b.labels - a.labels);
  const pick = (key) => raws.find((r) => r[key])?.[key] ?? null;
  let birthDate = pick('birthDate'), gender = pick('gender');
  const province = pick('province');
  const warnings = [];

  const cands = [...new Set(raws.flatMap((r) => r.nikCands))];
  const rank = (c, repaired) => {
    const info = nikInfo(c, today);
    if (!info) return null;
    const score = (birthDate && info.birthDate.slice(2) === birthDate.slice(2) ? 4 : 0) + (gender && info.gender === gender ? 1 : 0) + (repaired ? 0 : 2);
    return { nik: c, info, score, repaired };
  };
  let best = cands.map((c) => rank(c, false)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
  if (!best) best = cands.flatMap((c) => nikRepairs(c, province, birthDate, gender)).map((c) => rank(c, true)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
  const nik = best?.nik ?? cands[0] ?? null;
  if (!nik) warnings.push('NIK tidak terbaca — ketik manual dari KTP.');
  else if (!best) warnings.push('NIK terbaca tetapi kode wilayah/tanggalnya tidak sah — periksa setiap digit.');
  else if (best.repaired) warnings.push('Satu digit NIK dikoreksi otomatis agar cocok dengan provinsi/tanggal lahir — cocokkan dengan KTP.');

  let dateConflict = false;
  if (best) {
    if (!birthDate) {
      birthDate = best.info.birthDate;
      warnings.push('Tanggal lahir tidak terbaca; diisi dari NIK.');
    } else if (best.info.birthDate.slice(2) !== birthDate.slice(2)) {
      dateConflict = true;
      warnings.push(`Tanggal lahir terbaca ${dmy(birthDate)}, tetapi NIK menunjukkan ${dmy(best.info.birthDate)} — salah satu keliru, cek KTP.`);
    }
    if (!gender) gender = best.info.gender;
    else if (best.info.gender !== gender) warnings.push('Jenis kelamin tidak sesuai dengan NIK (tanggal pada NIK perempuan ditambah 40) — cek KTP.');
  }

  // "JL." sering terbaca "IL." / "J1.".
  const street = pick('street')?.replace(/^(?:[IJ1|]L|J[1I|])\.?\s+/, 'JL. ') ?? null;
  const rtrw = pick('rtrw'), village = pick('village'), district = pick('district'), regency = pick('regency');
  const ktpAddress = street
    ? [street, rtrw && `RT/RW ${rtrw}`, village && `KEL. ${village}`, district && `KEC. ${district}`, regency, province && PROVINCES[province]].filter(Boolean).join(', ')
    : null;
  // Tempat lahir umumnya sama dengan nama wilayah di KTP; satu-dua huruf yang salah baca disamakan.
  let birthPlace = pick('birthPlace');
  const places = [district, village, regency?.replace(/^(KABUPATEN|KOTA)\s+/, ''), ...Object.values(PROVINCES)].filter(Boolean);
  if (birthPlace?.length >= 5 && !places.includes(birthPlace)) {
    const near = places.find((p) => editDistance(p, birthPlace) <= Math.max(1, Math.floor(p.length / 6)));
    if (near) birthPlace = near;
  }
  const fields = { nik, name: pick('name'), birthPlace, birthDate, gender, maritalStatus: pick('maritalStatus'), bloodType: pick('bloodType'), ktpAddress };
  for (const [key, label] of [['name', 'Nama'], ['ktpAddress', 'Alamat']]) if (!fields[key]) warnings.push(`${label} tidak terbaca — isi manual.`);
  return {
    fields,
    warnings,
    complete: Boolean(best && !best.repaired && !dateConflict && fields.name && street && rtrw),
    labels: Math.max(0, ...raws.map((r) => r.labels)),
  };
}
