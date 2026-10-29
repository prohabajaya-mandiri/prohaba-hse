// Izin kerja khusus dari owner: aplikasi hanya merekam izin yang sah, tidak menerbitkannya.
export const WORK_PERMIT_STATUSES = ['TERCATAT', 'AKTIF', 'BERAKHIR', 'DITUTUP', 'DIBATALKAN'];

/** Status tampil: izin aktif yang melewati waktu berakhir menjadi BERAKHIR (turunan, belum ditutup). */
export function workPermitStatus(p, now = new Date()) {
  if (p.status === 'AKTIF' && new Date(p.endAt) < now) return 'BERAKHIR';
  return p.status;
}

const TRANSITIONS = {
  // Aktif hanya bila nomor & penerbit owner terisi dan salinan izin terlampir (dicek di service).
  ACTIVATE: { from: ['TERCATAT'], to: 'AKTIF' },
  CLOSE: { from: ['AKTIF'], to: 'DITUTUP' },
  CANCEL: { from: ['TERCATAT', 'AKTIF'], to: 'DIBATALKAN' },
};

export function workPermitTransition(role, action, status) {
  const rule = Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action] : null;
  if (!rule || !rule.from.includes(status) || !['HO_HSE', 'HSE_SITE'].includes(role)) return null;
  return { action, to: rule.to };
}
