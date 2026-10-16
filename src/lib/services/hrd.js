import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { canEditSalary, canSeeSensitive, siteFilter } from '../access.js';
import { actorName, audit } from '../audit.js';
import { decrypt, encrypt } from '../crypto.js';
import { today } from '../dates.js';
import { RECOMMENDATION_ACTIONS, simulate, validateSteps } from '../domain/hrd.js';
import { getSetting } from '../settings.js';
import { choice, date, ensure, InputError, money, object, text } from '../validation.js';
import { scopedPersonnel } from './common.js';

async function matrix() {
  return getSetting('access.salary');
}

/** Personel + rekomendasi terakhir + gaji berlaku (hanya bila diizinkan matriks). */
export async function hrBoard(user, f = {}) {
  const m = await matrix();
  const salaryAllowed = canSeeSensitive(user, 'SALARY', null, m);
  const where = { isFormer: false, ...siteFilter(user, f.siteId, 'currentSiteId') };
  if (f.category) where.category = String(f.category);
  if (f.workStatus) where.workStatus = String(f.workStatus);
  const people = await prisma.personnel.findMany({
    where, orderBy: [{ currentSiteId: 'asc' }, { name: 'asc' }], take: 5000,
    select: {
      id: true, code: true, name: true, category: true, position: true, workStatus: true, currentSiteId: true,
      currentSite: { select: { code: true, name: true } },
      recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
      salaries: { where: { effectiveFrom: { lte: today() } }, orderBy: { effectiveFrom: 'desc' }, take: 1 },
    },
  });
  const rows = people.map((p) => {
    const rec = p.recommendations[0] ?? null;
    const sal = p.salaries[0];
    return {
      id: p.id, code: p.code, name: p.name, category: p.category, position: p.position, workStatus: p.workStatus,
      siteId: p.currentSiteId, siteCode: p.currentSite?.code ?? '-', siteName: p.currentSite?.name ?? '-',
      recommendation: rec ? { color: rec.color, action: rec.action, reason: rec.reason, by: rec.creatorName, at: rec.createdAt } : null,
      salary: salaryAllowed && sal ? { base: Number(decrypt(sal.baseEnc)), allowance: Number(decrypt(sal.allowanceEnc)), effectiveFrom: sal.effectiveFrom } : null,
      hasSalary: Boolean(sal),
    };
  });
  const counts = rows.reduce((c, r) => {
    const k = r.recommendation?.color ?? 'BELUM';
    c.color[k] = (c.color[k] ?? 0) + 1;
    c.status[r.workStatus] = (c.status[r.workStatus] ?? 0) + 1;
    return c;
  }, { color: {}, status: {} });
  return { rows, counts, salaryAllowed, canEditSalary: canEditSalary(user, m) };
}

export async function saveRecommendation(user, personnelId, body) {
  object(body, ['color', 'action', 'reason']);
  const person = await scopedPersonnel(user, personnelId);
  const color = choice(body.color, Object.keys(RECOMMENDATION_ACTIONS), 'Warna');
  const action = choice(body.action, RECOMMENDATION_ACTIONS[color], 'Tindakan');
  const reason = text(body.reason, 'Alasan', 1000, color === 'HIJAU');
  return prisma.$transaction(async (tx) => {
    const row = await tx.hrRecommendation.create({ data: { personnelId: person.id, color, action, reason, createdBy: user.id, creatorName: actorName(user) } });
    await audit(tx, user, { action: 'CREATE', module: 'hrd', recordId: person.id, siteId: person.currentSiteId, after: { color, action, reason }, note: 'Rekomendasi HRD (simulasi, tidak mengubah status kerja)' });
    return row;
  });
}

export async function saveSalary(user, personnelId, body) {
  object(body, ['base', 'allowance', 'effectiveFrom']);
  if (!canEditSalary(user, await matrix())) throw new InputError('Anda tidak berwenang mengubah data gaji.', 403);
  const person = await scopedPersonnel(user, personnelId);
  const base = money(body.base, 'Gaji pokok');
  const allowance = money(body.allowance ?? 0, 'Tunjangan');
  const effectiveFrom = date(body.effectiveFrom, 'Berlaku mulai');
  return prisma.$transaction(async (tx) => {
    const row = await tx.salary.create({ data: { personnelId: person.id, baseEnc: encrypt(base), allowanceEnc: encrypt(allowance), effectiveFrom, createdBy: user.id } });
    // Nominal gaji tidak ditulis ke audit log; hanya fakta perubahan.
    await audit(tx, user, { action: 'UPDATE', module: 'hrd', recordId: person.id, siteId: person.currentSiteId, note: 'Data gaji diperbarui, berlaku ' + effectiveFrom.toISOString().slice(0, 10) });
    return { id: row.id };
  });
}

export const listScenarios = () => prisma.efficiencyScenario.findMany({ orderBy: { updatedAt: 'desc' } });

export async function saveScenario(user, scenarioId, body) {
  object(body, ['name', 'notes', 'steps']);
  const data = { name: text(body.name, 'Nama skenario', 150), notes: text(body.notes, 'Catatan', 2000, true), steps: body.steps };
  const err = validateSteps(data.steps);
  ensure(!err, err);
  data.steps = data.steps.map((s) => ({ month: s.month, rules: Object.fromEntries(Object.entries(s.rules ?? {}).map(([g, r]) => [g, { basis: r.basis, percent: Number(r.percent) }])) })).sort((a, b) => a.month.localeCompare(b.month));
  return prisma.$transaction(async (tx) => {
    const row = scenarioId ? await tx.efficiencyScenario.update({ where: { id: scenarioId }, data }) : await tx.efficiencyScenario.create({ data: { ...data, createdBy: user.id } });
    await audit(tx, user, { action: scenarioId ? 'UPDATE' : 'CREATE', module: 'hrd', recordId: row.id, after: { name: data.name, months: data.steps.map((s) => s.month) } });
    return row;
  });
}

/** Simulasi biaya & penghematan — bukan aturan payroll; realisasi mengikuti kontrak/peraturan. */
export async function runSimulation(user, scenarioId, f = {}) {
  const board = await hrBoard(user, f);
  if (!board.salaryAllowed) throw new InputError('Simulasi biaya memerlukan akses data gaji.', 403);
  const scenario = await prisma.efficiencyScenario.findUnique({ where: { id: scenarioId } });
  ensure(scenario, 'Skenario tidak ditemukan.', 404);
  const people = board.rows.filter((r) => r.salary).map((r) => ({
    siteId: r.siteId, siteName: r.siteCode, group: r.recommendation?.action ?? 'LANJUT', base: r.salary.base, allowance: r.salary.allowance,
  }));
  const result = simulate(people, scenario.steps);
  return { scenario, ...result, missingSalary: board.rows.filter((r) => !r.hasSalary).length, included: people.length };
}

export async function exportSimulation(user, scenarioId, f) {
  const r = await runSimulation(user, scenarioId, f);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.rows.map((x) => ({ Bulan: x.month, Site: x.siteName, Personel: x.headcount, 'Biaya normal': x.normal, 'Biaya skenario': x.scenario, Penghematan: x.saving }))), 'Simulasi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Skenario', r.scenario.name], ['Catatan', r.scenario.notes ?? ''], ['Total normal', r.totals.normal], ['Total skenario', r.totals.scenario], ['Total penghematan', r.totals.saving],
    ['Personel dihitung', r.included], ['Personel tanpa data gaji', r.missingSalary], [],
    ['Persentase hanya simulasi, bukan aturan payroll otomatis. Realisasi wajib sesuai kontrak, peraturan dan hukum.'],
  ]), 'Keterangan');
  await audit(null, user, { action: 'EXPORT', module: 'hrd', recordId: scenarioId, note: 'Export simulasi efisiensi' });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
