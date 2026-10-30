import { addDays, addMonths, daysBetween } from '../dates.js';

export const MCU_TYPES = ['PRE_EMPLOYMENT', 'ANNUAL', 'FOLLOW_UP', 'KHUSUS'];
export const MCU_TYPE_LABELS = { PRE_EMPLOYMENT: 'Pre-Employment', ANNUAL: 'Annual', FOLLOW_UP: 'Follow Up', KHUSUS: 'Khusus' };
export const MCU_RESULTS = ['PENDING', 'FIT', 'FOLLOW_UP', 'UNFIT'];
export const MCU_STAGES = ['SCREENING', 'MCU', 'MENUNGGU_HASIL', 'SUBMIT', 'FEEDBACK', 'FOLLOW_UP', 'SUBMIT_FU', 'MOBILISASI', 'SELESAI'];
export const MCU_STAGE_LABELS = {
  SCREENING: 'Screening',
  MCU: 'MCU',
  MENUNGGU_HASIL: 'Menunggu hasil',
  SUBMIT: 'Submit hasil',
  FEEDBACK: 'Feedback',
  FOLLOW_UP: 'Follow Up',
  SUBMIT_FU: 'Submit FU',
  MOBILISASI: 'Mobilisasi',
  SELESAI: 'Selesai',
};

/** Tahap awal: Pre-Employment dimulai dari screening; jenis lain langsung dari pemeriksaan MCU. */
export const firstStage = (type) => (type === 'PRE_EMPLOYMENT' ? 'SCREENING' : 'MCU');

/**
 * Tahap berikutnya dari catatan MCU. Alur hanya maju satu tahap agar admin tidak bisa
 * melompat atau mundur. Mobilisasi hanya untuk Pre-Employment; UNFIT langsung selesai.
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
  if (to === 'SUBMIT') return ['resultDate', 'result', 'fuDueDate', 'validUntil', 'notes'];
  if (to === 'FEEDBACK') return ['submitDate'];
  if (from === 'FEEDBACK') return ['feedbackDate', 'feedback'];
  return [];
}

/** Field yang sudah "terbuka" (tahapnya sudah dilalui) sehingga boleh dikoreksi lewat edit. */
export function reachedFields(stage) {
  const i = MCU_STAGES.indexOf(stage);
  const at = (s) => i >= MCU_STAGES.indexOf(s);
  return [
    'clinic', 'cost', 'screeningDate',
    ...(at('MCU') ? ['mcuDate'] : []),
    ...(at('SUBMIT') ? ['resultDate', 'result', 'fuDueDate', 'validUntil', 'notes'] : []),
    ...(at('FEEDBACK') ? ['submitDate'] : []),
    ...(i > MCU_STAGES.indexOf('FEEDBACK') ? ['feedbackDate', 'feedback'] : []),
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
