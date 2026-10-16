export const CATEGORIES = ['STAFF', 'MANPOWER', 'HARIAN_KANTOR'];
export const CATEGORY_LABELS = { STAFF: 'Staff', MANPOWER: 'Manpower', HARIAN_KANTOR: 'Harian Kantor' };
export const WORK_STATUSES = ['ACTIVE', 'CUTI', 'SAKIT', 'MCU', 'RESIGN', 'DIRUMAHKAN', 'MUTASI'];
export const MARITAL = ['MENIKAH', 'BELUM_MENIKAH', 'CERAI'];
export const MARITAL_LABELS = { MENIKAH: 'Menikah', BELUM_MENIKAH: 'Belum menikah', CERAI: 'Cerai' };
export const BLOOD_TYPES = ['A', 'B', 'AB', 'O'];
export const INACTIVE_STATUSES = ['RESIGN'];

// Kolom template import Excel standar. Header dicocokkan tanpa memperhatikan huruf besar/kecil.
export const IMPORT_COLUMNS = [
  ['nik', 'NIK', true],
  ['name', 'Nama', true],
  ['birthPlace', 'Tempat Lahir'],
  ['birthDate', 'Tanggal Lahir (YYYY-MM-DD)'],
  ['gender', 'Jenis Kelamin (L/P)'],
  ['maritalStatus', 'Status Nikah (MENIKAH/BELUM_MENIKAH/CERAI)'],
  ['education', 'Pendidikan'],
  ['major', 'Jurusan'],
  ['phoneWa', 'No WA'],
  ['emergencyName', 'Kontak Darurat'],
  ['emergencyPhone', 'No Kontak Darurat'],
  ['emergencyRelation', 'Hubungan Kontak Darurat'],
  ['ktpAddress', 'Alamat KTP', true],
  ['domicileAddress', 'Alamat Domisili'],
  ['originRegion', 'Asal Daerah'],
  ['category', 'Kategori (STAFF/MANPOWER/HARIAN_KANTOR)', true],
  ['position', 'Jabatan', true],
  ['siteCode', 'Kode Site', true],
  ['startDate', 'Tanggal Mulai (YYYY-MM-DD)'],
  ['bpjsKesehatan', 'BPJS Kesehatan'],
  ['bpjsKetenagakerjaan', 'BPJS Ketenagakerjaan'],
  ['bloodType', 'Golongan Darah'],
  ['shirtSize', 'Ukuran Baju'],
  ['shoeSize', 'Ukuran Sepatu'],
  ['bankName', 'Nama Bank'],
  ['bankAccount', 'No Rekening'],
  ['bankAccountName', 'Nama Pemilik Rekening'],
  ['foremanCode', 'Kode Mandor'],
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Petakan baris Excel (object header→nilai) ke field internal. */
export function mapImportRow(raw) {
  const lookup = new Map(Object.entries(raw).map(([k, v]) => [norm(k), v]));
  const row = {};
  for (const [field, header] of IMPORT_COLUMNS) {
    const v = lookup.get(norm(header)) ?? lookup.get(norm(field));
    if (v !== undefined && v !== null && String(v).trim() !== '') row[field] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
  }
  return row;
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
