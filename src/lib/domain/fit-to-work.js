// Skrining Fit to Work mengikuti form P5M owner (AMM-IPT-F-SHE-010A). Fungsi murni, aman di client.

export const FIT_STATUSES = ['AMAN', 'PENGAWASAN', 'TIDAK_BOLEH'];
const RANK = { AMAN: 0, PENGAWASAN: 1, TIDAK_BOLEH: 2 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

/**
 * Jam istirahat hari ini: ≥ 6 aman, 4–5 boleh dengan pengawasan lebih, ≤ 3 tidak boleh bekerja.
 * Hari ini + kemarin (bila diisi): ≥ 12 aman, 9–11 dengan pengawasan, ≤ 8 tidak boleh bekerja.
 */
export function restStatus(today, yesterday = null) {
  const t = Number(today);
  let s = t >= 6 ? 'AMAN' : t >= 4 ? 'PENGAWASAN' : 'TIDAK_BOLEH';
  if (yesterday !== null && yesterday !== undefined && yesterday !== '') {
    const total = t + Number(yesterday);
    s = worst(s, total >= 12 ? 'AMAN' : total >= 9 ? 'PENGAWASAN' : 'TIDAK_BOLEH');
  }
  return s;
}

/** Status akhir + alasan. Keputusan GL "tidak boleh kerja" selalu final. */
export function fitStatus({ restToday, restYesterday = null, healthy = true, medication = false, mentalReady = true, allowedByGl = true }) {
  const reasons = [];
  let status = restStatus(restToday, restYesterday);
  if (status !== 'AMAN') {
    const both = restYesterday !== null && restYesterday !== undefined && restYesterday !== '';
    reasons.push(`Istirahat ${restToday} jam${both ? ` (2 hari ${Number(restToday) + Number(restYesterday)} jam)` : ''}`);
  }
  if (!healthy) { status = worst(status, 'PENGAWASAN'); reasons.push('Kurang sehat'); }
  if (medication) { status = worst(status, 'PENGAWASAN'); reasons.push('Minum obat'); }
  if (!mentalReady) { status = worst(status, 'PENGAWASAN'); reasons.push('Mental belum siap'); }
  if (!allowedByGl) { status = 'TIDAK_BOLEH'; reasons.push('GL: tidak boleh kerja'); }
  return { status, reasons };
}

export const summarizeChecks = (checks) => ({
  total: checks.length,
  okCount: checks.filter((c) => c.status === 'AMAN').length,
  watchCount: checks.filter((c) => c.status === 'PENGAWASAN').length,
  stopCount: checks.filter((c) => c.status === 'TIDAK_BOLEH').length,
});

export const ALCOHOL_RESULTS = ['NEGATIF', 'POSITIF'];
export const ALCOHOL_INTERVAL_MONTHS = 12;
