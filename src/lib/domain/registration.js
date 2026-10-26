// Pendaftaran mandiri pegawai baru. Fungsi murni (aman dipakai client & server).
import { nikInfo } from './personnel.js';

// Pegawai baru tiba di Balikpapan (WITA). Tanggal tiba mengikuti kalender WITA,
// bukan zona aplikasi (WIB), agar pengisian 23.00–24.00 WITA tidak tercatat sehari sebelumnya.
export const ARRIVAL_TIMEZONE = 'Asia/Makassar';
export const MCU_OFFSET_DAYS = 1;
export const MIN_AGE = 18;
export const REGISTRATION_STATUSES = ['MENUNGGU', 'DISETUJUI', 'DITOLAK'];

const DAY = 86400000;
const isoOf = (d) => new Date(d).toISOString().slice(0, 10);

/** Tanggal hari ini (YYYY-MM-DD) di Balikpapan. */
export function arrivalIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ARRIVAL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Rencana MCU: H+1 dari tanggal tiba. */
export function mcuIso(arrival) {
  return isoOf(new Date(String(arrival).slice(0, 10) + 'T00:00:00Z').getTime() + MCU_OFFSET_DAYS * DAY);
}

/** Umur (tahun penuh) pada tanggal `on`. */
export function ageOn(birthDate, on = new Date()) {
  if (!birthDate) return null;
  const b = new Date(String(birthDate).slice(0, 10) + 'T00:00:00Z');
  const t = new Date(isoOf(on) + 'T00:00:00Z');
  if (!Number.isFinite(b.getTime()) || b > t) return null;
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

/** Nomor WA Indonesia → format internasional tanpa tanda (628…), untuk tautan wa.me. */
export function waNumber(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('62')) return d;
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

/**
 * Pemeriksaan otomatis untuk verifikator. `existing` = personel dengan NIK sama (atau null),
 * `pendingDupes` = jumlah pendaftaran lain berstatus MENUNGGU dengan NIK sama.
 */
export function registrationChecks({ nik, birthDate, gender, hasKtp }, { existing = null, pendingDupes = 0, today = new Date() } = {}) {
  const info = nikInfo(nik, today);
  const birth = birthDate ? isoOf(birthDate) : null;
  const age = ageOn(birth, today);
  const checks = [];
  const add = (key, ok, label, level = ok ? 'ok' : 'warn') => checks.push({ key, ok, level, label });
  add('nik', Boolean(info), info ? 'Format NIK valid (kode wilayah & tanggal lahir terbaca).' : 'Format NIK tidak dikenali — cocokkan dengan foto KTP.');
  if (info) {
    add('birth', info.birthDate === birth, info.birthDate === birth ? 'Tanggal lahir cocok dengan NIK.' : `Tanggal lahir berbeda dengan NIK (NIK: ${info.birthDate}).`);
    if (gender) add('gender', info.gender === gender, info.gender === gender ? 'Jenis kelamin cocok dengan NIK.' : 'Jenis kelamin berbeda dengan NIK.');
  }
  add('age', age !== null && age >= MIN_AGE, age === null ? 'Umur tidak dapat dihitung.' : age >= MIN_AGE ? `Umur ${age} tahun.` : `Umur ${age} tahun — di bawah ${MIN_AGE} tahun.`, age !== null && age >= MIN_AGE ? 'ok' : 'danger');
  add('ktp', Boolean(hasKtp), hasKtp ? 'Foto KTP terlampir.' : 'Foto KTP tidak ada.');
  if (existing) {
    add('existing', false, existing.isFormer
      ? `NIK sudah terdaftar sebagai mantan personel ${existing.name}${existing.nip ? ` (NIP ${existing.nip})` : ''} — setujui untuk mengaktifkan kembali profil lama.`
      : `NIK sudah terdaftar sebagai personel aktif ${existing.name}${existing.nip ? ` (NIP ${existing.nip})` : ''} — tidak dapat dibuat profil baru.`,
    existing.isFormer ? 'warn' : 'danger');
  } else add('existing', true, 'NIK belum terdaftar di master karyawan.');
  if (pendingDupes > 0) add('dupe', false, `Ada ${pendingDupes} pendaftaran lain dengan NIK sama yang belum diputuskan.`);
  return checks;
}
