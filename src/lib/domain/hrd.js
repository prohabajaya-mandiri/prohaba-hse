export const RECOMMENDATION_COLORS = { HIJAU: 'Lanjut', KUNING: 'Dipertimbangkan', MERAH: 'Diberhentikan' };
export const RECOMMENDATION_ACTIONS = {
  HIJAU: ['LANJUT'],
  KUNING: ['DIRUMAHKAN', 'MUTASI'],
  MERAH: ['DIBERHENTIKAN'],
};
// Kelompok simulasi = tindakan rekomendasi; personel tanpa rekomendasi dianggap LANJUT.
export const SCENARIO_GROUPS = ['LANJUT', 'DIRUMAHKAN', 'MUTASI', 'DIBERHENTIKAN'];

// Skenario yang pernah dibahas (hanya simulasi, bukan aturan payroll).
export const DISCUSSED_SCENARIO = {
  name: 'Skenario efisiensi Okt 2026 – Jan 2027',
  notes: 'Okt 2026 seluruhnya digaji; Nov dirumahkan menerima gaji pokok; Des 50%; Jan 2027 30%. Simulasi, bukan aturan payroll.',
  steps: [
    { month: '2026-10', rules: { DIRUMAHKAN: { basis: 'TOTAL', percent: 100 } } },
    { month: '2026-11', rules: { DIRUMAHKAN: { basis: 'POKOK', percent: 100 } } },
    { month: '2026-12', rules: { DIRUMAHKAN: { basis: 'POKOK', percent: 50 } } },
    { month: '2027-01', rules: { DIRUMAHKAN: { basis: 'POKOK', percent: 30 } } },
  ],
};

const rule = (step, group) => step.rules?.[group] ?? { basis: 'TOTAL', percent: 100 };

/**
 * Simulasi biaya per site per bulan.
 * people: [{ siteId, siteName, group, base, allowance }]
 * Hasil: baris per bulan × site berisi biaya normal, biaya skenario, dan penghematan.
 */
export function simulate(people, steps) {
  const rows = [];
  for (const step of steps) {
    const bySite = new Map();
    for (const p of people) {
      const r = rule(step, p.group);
      const normal = p.base + p.allowance;
      const basis = r.basis === 'POKOK' ? p.base : normal;
      const cost = Math.round(basis * (r.percent / 100));
      const row = bySite.get(p.siteId) ?? { month: step.month, siteId: p.siteId, siteName: p.siteName, headcount: 0, normal: 0, scenario: 0 };
      row.headcount += 1;
      row.normal += normal;
      row.scenario += cost;
      bySite.set(p.siteId, row);
    }
    for (const row of bySite.values()) rows.push({ ...row, saving: row.normal - row.scenario });
  }
  const totals = rows.reduce((t, r) => ({ normal: t.normal + r.normal, scenario: t.scenario + r.scenario, saving: t.saving + r.saving }), { normal: 0, scenario: 0, saving: 0 });
  return { rows, totals };
}

export function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 24) return 'Skenario harus memiliki 1–24 bulan.';
  for (const s of steps) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s?.month ?? '')) return 'Bulan skenario harus YYYY-MM.';
    for (const [group, r] of Object.entries(s.rules ?? {})) {
      if (!SCENARIO_GROUPS.includes(group)) return 'Kelompok skenario tidak valid.';
      if (!['TOTAL', 'POKOK'].includes(r?.basis)) return 'Dasar perhitungan harus TOTAL atau POKOK.';
      if (!(Number.isFinite(r.percent) && r.percent >= 0 && r.percent <= 100)) return 'Persentase harus 0–100.';
    }
  }
  if (new Set(steps.map((s) => s.month)).size !== steps.length) return 'Bulan skenario tidak boleh ganda.';
  return null;
}
