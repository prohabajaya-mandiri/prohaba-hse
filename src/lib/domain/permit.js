import { addMonths, addDays, daysBetween } from '../dates.js';

export const PERMIT_STATUS_LABELS = {
  AKTIF: 'Aktif',
  AKAN_HABIS: 'Akan habis',
  KEDALUWARSA: 'Kedaluwarsa',
  DICABUT: 'Dicabut',
  BELUM_BERLAKU: 'Belum berlaku',
};

export function permitStatus(permit, today, threshold = 30) {
  if (permit.revokedAt) return 'DICABUT';
  if (new Date(permit.startDate) > new Date(today)) return 'BELUM_BERLAKU';
  const left = daysBetween(today, permit.endDate);
  if (left < 0) return 'KEDALUWARSA';
  if (left <= threshold) return 'AKAN_HABIS';
  return 'AKTIF';
}

/**
 * Acuan masa berlaku (bukan penerbitan otomatis): FIT 12 bulan, FOLLOW UP sementara 3 bulan
 * bila disetujui owner. UNFIT tidak memenuhi syarat → null.
 */
export function suggestedEnd(startDate, basisResult, defaults = { fitMonths: 12, followUpMonths: 3 }) {
  if (basisResult === 'FIT') return addDays(addMonths(startDate, defaults.fitMonths), -1);
  if (basisResult === 'FOLLOW_UP') return addDays(addMonths(startDate, defaults.followUpMonths), -1);
  return null;
}

/** Peringatan kelayakan saat permit diinput; keputusan tetap pada owner/otoritas site. */
export function permitWarnings({ basisResult, isTemporary, startDate, endDate }, defaults) {
  const warnings = [];
  if (basisResult === 'UNFIT') warnings.push('Hasil MCU UNFIT: personel tidak memenuhi syarat pekerjaan terkait.');
  if (!basisResult) warnings.push('Tidak ada hasil MCU acuan.');
  const ref = basisResult ? suggestedEnd(startDate, basisResult, defaults) : null;
  if (ref && new Date(endDate) > ref) warnings.push('Masa berlaku melebihi acuan untuk hasil ' + basisResult + '.');
  if (basisResult === 'FOLLOW_UP' && !isTemporary) warnings.push('Status FOLLOW UP umumnya hanya permit sementara.');
  return warnings;
}
