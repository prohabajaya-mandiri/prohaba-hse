import { addDays, addMonths, daysBetween } from '../dates.js';

export const MCU_TYPES = ['PRE_EMPLOYMENT', 'ANNUAL', 'FOLLOW_UP', 'KHUSUS'];
export const MCU_TYPE_LABELS = { PRE_EMPLOYMENT: 'Pre-Employment', ANNUAL: 'Annual', FOLLOW_UP: 'Follow Up', KHUSUS: 'Khusus' };
export const MCU_RESULTS = ['PENDING', 'FIT', 'FOLLOW_UP', 'UNFIT'];
export const MCU_STAGES = ['SCREENING', 'MCU', 'MENUNGGU_HASIL', 'SUBMIT', 'FEEDBACK', 'FOLLOW_UP', 'SUBMIT_FU', 'MOBILISASI', 'SELESAI'];
export const MCU_STAGE_LABELS = {
  SCREENING: 'Screening',
  MCU: 'MCU',
  MENUNGGU_HASIL: 'Menunggu hasil',
  SUBMIT: 'Hasil keluar',
  FEEDBACK: 'Dikirim ke Paramedic',
  FOLLOW_UP: 'Follow Up',
  SUBMIT_FU: 'Submit FU',
  MOBILISASI: 'Mobilisasi',
  SELESAI: 'Selesai',
};

// Follow Up dirujuk ke maksimal 6 dokter.
export const FU_DOCTORS = ['Dokter Umum', 'Dokter Sp. Penyakit Dalam', 'Dokter Mata', 'Dokter Ahli Gizi', 'Dokter Sp. Jantung', 'Dokter Sp. THT', 'Dokter Gigi'];
export const FU_DOCTOR_SLOTS = 6;

/** Tahap awal: Pre-Employment dimulai dari screening; jenis lain langsung dari pemeriksaan MCU. */
export const firstStage = (type) => (type === 'PRE_EMPLOYMENT' ? 'SCREENING' : 'MCU');

/**
 * Tahap berikutnya dari catatan MCU. Alur hanya maju satu tahap agar admin tidak bisa
 * melompat atau mundur: MCU → menunggu hasil → hasil keluar → dikirim ke Paramedic Site →
 * hasil FIT/FOLLOW UP/UNFIT dari feedback Paramedic. Karena itu tahap setelah FEEDBACK
 * bergantung pada `result` yang diisi di langkah yang sama. Mobilisasi hanya untuk
 * Pre-Employment; UNFIT langsung selesai.
 */
export function nextStage({ stage, type, result }) {
  const afterResult = type === 'PRE_EMPLOYMENT' && result !== 'UNFIT' ? 'MOBILISASI' : 'SELESAI';
  switch (stage) {
    case 'SCREENING': return 'MCU';
    case 'MCU': return 'MENUNGGU_HASIL';
    case 'MENUNGGU_HASIL': return 'SUBMIT';
    case 'SUBMIT': return 'FEEDBACK';
    case 'FEEDBACK': return result === 'FOLLOW_UP' ? 'FOLLOW_UP' : afterResult;
    case 'FOLLOW_UP': return 'SUBMIT_FU';
    case 'SUBMIT_FU': return afterResult;
    case 'MOBILISASI': return 'SELESAI';
    default: return null;
  }
}

/** Isian yang wajib/boleh diisi saat masuk ke tahap `to` (dari tahap `from`). */
export function stepFields(from, to) {
  if (to === 'MCU') return ['mcuDate'];
  if (to === 'SUBMIT') return ['resultDate', 'notes'];
  if (to === 'FEEDBACK') return ['submitDate'];
  if (from === 'FEEDBACK') return ['feedbackDate', 'result', 'fuDoctors', 'fuDueDate', 'validUntil', 'feedback'];
  return [];
}

/** Field yang sudah "terbuka" (tahapnya sudah dilalui) sehingga boleh dikoreksi lewat edit. */
export function reachedFields(stage) {
  const i = MCU_STAGES.indexOf(stage);
  const at = (s) => i >= MCU_STAGES.indexOf(s);
  return [
    'clinic', 'cost', 'screeningDate',
    ...(at('MCU') ? ['mcuDate'] : []),
    ...(at('SUBMIT') ? ['resultDate', 'notes'] : []),
    ...(at('FEEDBACK') ? ['submitDate'] : []),
    ...(i > MCU_STAGES.indexOf('FEEDBACK') ? ['feedbackDate', 'result', 'fuDoctors', 'fuDueDate', 'validUntil', 'feedback'] : []),
  ];
}

/**
 * Estimasi tanggal tiap tahap: Screening 1 → MCU 1 → tunggu hasil 3 → submit → feedback 3–5
 * → FU 2 (jika perlu) → submit FU → mobilisasi 2. Durasi hanya perencanaan, bukan keputusan medis.
 */
export function planMcu(start, d, needsFollowUp = false) {
  const plan = [];
  let cursor = new Date(start);
  const push = (stage, days) => {
    plan.push({ stage, start: cursor, end: addDays(cursor, Math.max(days - 1, 0)) });
    cursor = addDays(cursor, days);
  };
  push('SCREENING', d.screening);
  push('MCU', d.mcu);
  push('MENUNGGU_HASIL', d.waitResult);
  push('SUBMIT', 0);
  push('FEEDBACK', d.feedbackMax);
  if (needsFollowUp) {
    push('FOLLOW_UP', d.followUp);
    push('SUBMIT_FU', 0);
  }
  push('MOBILISASI', d.mobilization);
  return { plan, readyDate: cursor, totalDays: daysBetween(start, cursor) };
}

// Tanggal jatuh tempo MCU annual dihitung dari tanggal MCU (bukan tanggal input).
export function annualValidUntil(mcuDate, months = 12) {
  return mcuDate ? addMonths(mcuDate, months) : null;
}

/** Status kesehatan efektif personel dari catatan MCU terakhir yang sudah berhasil. */
export function fitness(latest, today) {
  if (!latest) return 'BELUM_MCU';
  if (latest.result === 'PENDING') return 'PROSES';
  if (latest.result === 'UNFIT') return 'UNFIT';
  if (latest.validUntil && new Date(latest.validUntil) < new Date(today)) return 'MCU_KEDALUWARSA';
  if (latest.result === 'FOLLOW_UP') {
    return latest.fuDueDate && new Date(latest.fuDueDate) < new Date(today) ? 'FU_TERLAMBAT' : 'FOLLOW_UP';
  }
  return 'FIT';
}

export const FITNESS_LABELS = {
  BELUM_MCU: 'Belum MCU',
  PROSES: 'Proses MCU',
  FIT: 'FIT',
  FOLLOW_UP: 'FOLLOW UP',
  FU_TERLAMBAT: 'FU terlambat',
  UNFIT: 'UNFIT',
  MCU_KEDALUWARSA: 'MCU kedaluwarsa',
};

export function dueState(date, today, threshold) {
  if (!date) return null;
  const left = daysBetween(today, date);
  if (left < 0) return { state: 'OVERDUE', left };
  if (left <= threshold) return { state: 'DUE_SOON', left };
  return { state: 'OK', left };
}
