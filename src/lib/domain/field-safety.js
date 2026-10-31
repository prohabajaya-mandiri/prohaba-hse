// Hazard Report, Inspeksi & P2H, dan Register Tindakan Korektif (CAPA). Fungsi murni, aman di client.

export const RISK_LEVELS = ['RENDAH', 'SEDANG', 'TINGGI', 'EKSTREM'];

// Matriks penilaian risiko owner (AMM, sheet "Matriks Resiko" pada formulir JSA): baris = keparahan 1–5,
// kolom = kemungkinan 1–5. Dipakai sama di Hazard Report dan JSA agar penilaian tidak berbeda.
const RISK_MATRIX = [
  ['L', 'L', 'M', 'M', 'M'],
  ['L', 'M', 'M', 'H', 'H'],
  ['M', 'M', 'H', 'H', 'E'],
  ['H', 'H', 'E', 'E', 'E'],
  ['E', 'E', 'E', 'E', 'E'],
];
export const RISK_CODES = { L: 'RENDAH', M: 'SEDANG', H: 'TINGGI', E: 'EKSTREM' };

export const riskCode = (likelihood, severity) => RISK_MATRIX[Number(severity) - 1]?.[Number(likelihood) - 1] ?? null;
export const riskLevel = (likelihood, severity) => RISK_CODES[riskCode(likelihood, severity)] ?? null;

export const LIKELIHOOD = [[1, '1 — Unlikely (hampir tidak mungkin)'], [2, '2 — Possible (mungkin)'], [3, '3 — Likely (kemungkinan besar)'], [4, '4 — Almost certain (hampir pasti)'], [5, '5 — Certain (pasti)']];
export const SEVERITY = [[1, '1 — Negligible (tanpa cedera)'], [2, '2 — Minor (P3K)'], [3, '3 — Significant (perawatan medis)'], [4, '4 — Severe (LTI / cacat)'], [5, '5 — Catastrophic (fatal)']];

// Tenggat tindakan korektif bawaan per tingkat risiko (hari kalender; draft parameter, dapat ditimpa saat dibuat).
export const DUE_DAYS = { EKSTREM: 1, TINGGI: 3, SEDANG: 7, RENDAH: 14 };

// Risiko tinggi/ekstrem hanya boleh ditutup HO HSE; selebihnya HSE Site atau HO HSE.
export const closeRoles = (risk) => (['TINGGI', 'EKSTREM'].includes(risk) ? ['HO_HSE'] : ['HSE_SITE', 'HO_HSE']);

export const HAZARD_TYPES = ['UNSAFE_ACT', 'UNSAFE_CONDITION'];
export const HAZARD_CATEGORIES = [
  'APD', 'Alat & unit', 'Kendaraan & lalu lintas', 'Area kerja & housekeeping', 'Bekerja di ketinggian',
  'Listrik', 'Bahan kimia / B3', 'Lingkungan', 'Prosedur & izin kerja', 'Lainnya',
];
export const HAZARD_STATUSES = ['BARU', 'TINDAK_LANJUT', 'SELESAI'];

export const INSPECTION_KINDS = ['P2H', 'AREA', 'APAR', 'LAINNYA'];
export const ANSWERS = ['OK', 'TIDAK_OK', 'NA'];

/** Ringkas jawaban checklist: butir kritis TIDAK_OK membuat unit/area TIDAK LAYAK. */
export function summarizeAnswers(answers) {
  const ok = answers.filter((a) => a.result === 'OK').length;
  const notOk = answers.filter((a) => a.result === 'TIDAK_OK');
  return { okCount: ok, notOkCount: notOk.length, result: notOk.some((a) => a.critical) ? 'TIDAK_LAYAK' : 'LAYAK', failed: notOk };
}

/** Butir template dari teks (satu baris = satu butir; awali "!" untuk butir kritis). */
export const parseItemsText = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  .map((l) => ({ text: l.replace(/^!\s*/, '').slice(0, 200), critical: l.startsWith('!') }));
export const itemsToText = (items) => (items ?? []).map((i) => (i.critical ? '! ' : '') + i.text).join('\n');

export const CAPA_SOURCES = ['HAZARD', 'INSPECTION', 'AUDIT', 'MANUAL'];
export const CAPA_STATUSES = ['TERBUKA', 'DALAM_PROSES', 'DIAJUKAN_TUTUP', 'DITUTUP'];

// Alur CAPA: PIC/site mengerjakan & mengajukan penutupan dengan bukti; verifikator menutup atau mengembalikan.
const CAPA_TRANSITIONS = {
  START: { from: ['TERBUKA'], to: 'DALAM_PROSES', roles: () => ['HSE_SITE', 'HO_HSE', 'PJO', 'PM'] },
  SUBMIT_CLOSE: { from: ['TERBUKA', 'DALAM_PROSES'], to: 'DIAJUKAN_TUTUP', roles: () => ['HSE_SITE', 'HO_HSE', 'PJO', 'PM'] },
  RETURN: { from: ['DIAJUKAN_TUTUP'], to: 'DALAM_PROSES', roles: closeRoles, note: true },
  CLOSE: { from: ['DIAJUKAN_TUTUP'], to: 'DITUTUP', roles: closeRoles },
  REOPEN: { from: ['DITUTUP'], to: 'DALAM_PROSES', roles: () => ['HO_HSE'], note: true },
};

export function capaTransition(role, action, status, risk) {
  const rule = Object.hasOwn(CAPA_TRANSITIONS, action) ? CAPA_TRANSITIONS[action] : null;
  if (!rule || !rule.from.includes(status) || !rule.roles(risk).includes(role)) return null;
  return { action, to: rule.to, noteRequired: Boolean(rule.note) };
}

export const capaActions = (role, status, risk) => Object.keys(CAPA_TRANSITIONS).filter((a) => capaTransition(role, a, status, risk));
