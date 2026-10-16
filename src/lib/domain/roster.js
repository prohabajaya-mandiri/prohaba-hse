import { addDays, daysBetween } from '../dates.js';

export const LEAVE_TYPES = ['CUTI', 'IZIN', 'SAKIT', 'OFF_ROSTER'];
export const LEAVE_LABELS = { CUTI: 'Cuti', IZIN: 'Izin', SAKIT: 'Sakit', OFF_ROSTER: 'Off roster' };
// SAKIT berbeda dari CUTI: sakit tidak mereset siklus onsite.
export const RESETS_CYCLE = ['CUTI', 'OFF_ROSTER'];

/** Pilih pola roster paling spesifik: site + kategori + status nikah > site + kategori > umum. */
export function pickPolicy(policies, { siteId, category, maritalStatus }) {
  const married = maritalStatus === 'MENIKAH' ? 'MENIKAH' : 'BELUM_MENIKAH';
  const candidates = policies.filter(
    (p) => p.isActive && p.category === category && (!p.siteId || p.siteId === siteId) && (!p.maritalStatus || p.maritalStatus === married),
  );
  const score = (p) => (p.siteId ? 2 : 0) + (p.maritalStatus ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

// Hari kerja: Senin–Sabtu (Minggu libur) untuk pola berbasis hari kerja, mis. 70 hari kerja.
export function addWorkdays(start, n) {
  let d = new Date(start), count = 0;
  while (count < n) {
    d = addDays(d, 1);
    if (d.getUTCDay() !== 0) count++;
  }
  return d;
}

export function nextLeaveDue(policy, cycleStart) {
  if (!policy || !cycleStart) return null;
  return policy.countWorkdays ? addWorkdays(cycleStart, policy.onsiteDays) : addDays(cycleStart, policy.onsiteDays);
}

/** Awal siklus onsite = tanggal kembali dari cuti/off terakhir, atau awal penempatan aktif. */
export function cycleStart(placementStart, leaves) {
  const resets = leaves
    .filter((l) => RESETS_CYCLE.includes(l.type) && l.status !== 'BATAL')
    .map((l) => new Date(l.returnDate ?? addDays(l.endDate, 1)))
    .filter((d) => !placementStart || d >= new Date(placementStart));
  const last = resets.sort((a, b) => b - a)[0];
  return last ?? (placementStart ? new Date(placementStart) : null);
}

export function rosterState(due, today, threshold = 14) {
  if (!due) return { state: 'TANPA_POLA', left: null };
  const left = daysBetween(today, due);
  if (left < 0) return { state: 'LEWAT_JADWAL', left };
  if (left <= threshold) return { state: 'MENDEKATI_CUTI', left };
  return { state: 'ONSITE', left };
}

export const ROSTER_STATE_LABELS = {
  TANPA_POLA: 'Pola belum diatur',
  ONSITE: 'Onsite',
  MENDEKATI_CUTI: 'Mendekati cuti',
  LEWAT_JADWAL: 'Lewat jadwal cuti',
  SEDANG_CUTI: 'Sedang cuti/off',
};
