// Assessment internal PJM bernilai 0/1/2, terpisah dari checklist. Penilai menentukan nilai berdasarkan bukti;
// tidak ada nilai otomatis. Final dikunci; koreksi dibuat sebagai revisi baru yang merujuk versi sebelumnya.
import { prisma } from '../prisma.js';
import { canManageCsms, canSeeSite, siteScope } from '../access.js';
import { actorName, audit } from '../audit.js';
import { iso } from '../dates.js';
import { assessmentTotals, validScore } from '../domain/csms.js';
import { nextNumber } from '../sequence.js';
import { bool, date, ensure, id as idOf, InputError, object, text } from '../validation.js';
import { notifyRoles } from './notify.js';

function requireManager(user) {
  if (!canManageCsms(user)) throw new InputError('Assessment internal dinilai dan dikunci oleh HO HSE.', 403);
}

function assertRead(user, siteId) {
  if (user.role === 'HRD' || !canSeeSite(user, siteId)) throw new InputError('Assessment site ini di luar cakupan Anda.', 403);
}

const itemCode = (i) => (i.sourceCode ? `${i.sourceCode} · ${i.internalCode}` : `${i.refCode ?? ''} (lanjutan) · ${i.internalCode}`.trim());

export async function listAssessments(user, f = {}) {
  if (user.role === 'HRD') return { rows: [] };
  const scope = siteScope(user);
  const rows = await prisma.csmsAssessment.findMany({
    where: { ...(scope === null ? {} : { siteId: { in: scope } }), ...(f.siteId ? { siteId: String(f.siteId) } : {}) },
    orderBy: [{ assessmentDate: 'desc' }, { revisionNo: 'desc' }],
    take: 200,
    include: { site: { select: { code: true, name: true } }, template: { select: { code: true, version: true, naPolicy: true } } },
  });
  return { rows };
}

/** Assessment final terakhir per site (yang belum digantikan revisi) untuk Ringkasan. */
export async function latestFinalBySite(user) {
  const { rows } = await listAssessments(user);
  const out = {};
  for (const r of rows) if (r.status === 'FINAL' && !r.supersededAt && !out[r.siteId]) out[r.siteId] = r;
  return Object.values(out);
}

export async function createAssessment(user, body) {
  requireManager(user);
  object(body, ['applicationId', 'periodLabel', 'assessmentDate', 'assessors', 'notes']);
  const applicationId = idOf(body.applicationId, 'Penerapan');
  const v = {
    periodLabel: text(body.periodLabel, 'Periode assessment', 80),
    assessmentDate: date(body.assessmentDate, 'Tanggal assessment'),
    assessors: text(body.assessors, 'Penilai', 300),
    notes: text(body.notes, 'Catatan', 3000, true),
  };
  return prisma.$transaction(async (tx) => {
    const app = await tx.csmsSiteApplication.findUnique({
      where: { id: applicationId },
      include: { site: { select: { csmsProfile: { select: { riskLevel: true } } } }, requirements: { where: { origin: 'TEMPLATE' }, include: { item: { include: { element: { select: { number: true } } } } } } },
    });
    ensure(app && app.status === 'ACTIVE', 'Penerapan CSMS aktif tidak ditemukan.', 404);
    const year = v.assessmentDate.getUTCFullYear();
    const number = await nextNumber(tx, `csms-assessment-${year}`, `ASM-${year}-`);
    const a = await tx.csmsAssessment.create({
      data: { ...v, number, siteId: app.siteId, applicationId, templateId: app.templateId, riskLevel: app.site.csmsProfile?.riskLevel ?? null, createdById: user.id, createdByName: actorName(user) },
    });
    // Nilai awal kosong (bukan 0 atau 2): penilai mengisi setiap butir berdasarkan bukti.
    await tx.csmsAssessmentScore.createMany({
      data: app.requirements.filter((r) => r.item).map((r) => ({
        assessmentId: a.id, itemId: r.itemId, itemCode: itemCode(r.item), itemText: r.item.displayText || r.item.sourceText,
        // Nomor unsur & teks butir disalin agar hasil tetap utuh walau template berganti versi.
        elementNo: r.item.element.number, maxScore: r.item.maxScore, applicable: r.applicability !== 'NA', score: null,
      })),
    });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: a.id, siteId: app.siteId, after: { number, ...v }, note: 'Assessment internal' });
    return a;
  }, { timeout: 30000 });
}

/** Bukti terbaru per butir dari checklist site (periode terakhir yang berbukti; terverifikasi diutamakan). */
async function liveEvidence(applicationId) {
  const fuls = await prisma.csmsFulfillment.findMany({
    where: { requirement: { applicationId, origin: 'TEMPLATE' }, evidenceLinks: { some: {} } },
    orderBy: { periodStart: 'desc' },
    include: { requirement: { select: { id: true, itemId: true } }, evidenceLinks: { include: { evidence: { select: { id: true, title: true, kind: true, validUntil: true, description: true } } } } },
  });
  const out = {};
  for (const f of fuls) {
    const prev = out[f.requirement.itemId];
    if (prev && (prev.status === 'VERIFIED' || f.status !== 'VERIFIED')) continue;
    out[f.requirement.itemId] = {
      requirementId: f.requirement.id, periodKey: f.periodKey, status: f.status,
      items: f.evidenceLinks.map((l) => ({ title: l.evidence.title, kind: l.evidence.kind, validUntil: iso(l.evidence.validUntil), summary: l.evidence.kind === 'SOURCE' ? l.evidence.description : null })),
    };
  }
  return out;
}

export async function getAssessment(user, id) {
  const a = await prisma.csmsAssessment.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, code: true, name: true } },
      template: { select: { id: true, code: true, version: true, name: true, ownerName: true, sourceDocCode: true, sourceRevision: true, sourceMaxScore: true, naPolicy: true, scoringGuide: true } },
      scores: { include: { item: { select: { sortOrder: true } } } },
      revisionOf: { select: { id: true, number: true, revisionNo: true, status: true } },
      revisions: { select: { id: true, number: true, revisionNo: true, status: true } },
      application: { select: { id: true } },
    },
  });
  ensure(a, 'Assessment tidak ditemukan.', 404);
  assertRead(user, a.siteId);
  const live = a.status === 'DRAFT' ? await liveEvidence(a.applicationId) : {};
  const [elements, findings, reqs] = await Promise.all([
    prisma.csmsElement.findMany({ where: { templateId: a.templateId }, orderBy: { number: 'asc' }, select: { number: true, name: true } }),
    prisma.csmsFinding.findMany({ where: { assessmentId: a.id }, select: { id: true, number: true, status: true, requirementId: true, description: true } }),
    prisma.csmsRequirement.findMany({ where: { applicationId: a.applicationId, origin: 'TEMPLATE' }, select: { id: true, itemId: true } }),
  ]);
  const reqByItem = Object.fromEntries(reqs.map((r) => [r.itemId, r.id]));
  const scores = a.scores
    .map((s) => {
      return { ...s, item: undefined, sortOrder: s.item.sortOrder, requirementId: reqByItem[s.itemId] ?? null, evidence: a.status === 'DRAFT' ? live[s.itemId] ?? null : s.evidence };
    })
    .sort((x, y) => x.elementNo - y.elementNo || x.sortOrder - y.sortOrder);
  return {
    ...a, scores, elements, findings,
    totals: assessmentTotals(scores, a.template.naPolicy),
    canEdit: canManageCsms(user) && a.status === 'DRAFT',
    canFinding: canManageCsms(user),
    canRevise: canManageCsms(user) && a.status === 'FINAL' && !a.supersededAt && !a.revisions.some((r) => r.status === 'DRAFT'),
  };
}

async function draftOf(tx, id) {
  const a = await tx.csmsAssessment.findUnique({ where: { id }, include: { template: { select: { naPolicy: true } } } });
  ensure(a, 'Assessment tidak ditemukan.', 404);
  ensure(a.status === 'DRAFT', 'Assessment final terkunci. Buat revisi untuk koreksi.', 409);
  return a;
}

/** Simpan nilai per butir (draft). Nilai kosong boleh disimpan; finalisasi mensyaratkan semua butir berlaku dinilai. */
export async function saveScores(user, id, body) {
  requireManager(user);
  object(body, ['scores', 'periodLabel', 'assessors', 'notes']);
  ensure(Array.isArray(body.scores) && body.scores.length <= 500, 'Daftar nilai tidak valid.');
  return prisma.$transaction(async (tx) => {
    const a = await draftOf(tx, id);
    const existing = Object.fromEntries((await tx.csmsAssessmentScore.findMany({ where: { assessmentId: id } })).map((s) => [s.itemId, s]));
    const changes = [];
    for (const raw of body.scores) {
      object(raw, ['itemId', 'score', 'applicable', 'note']);
      const row = existing[raw.itemId];
      ensure(row, 'Butir tidak termasuk assessment ini.');
      const score = raw.score === '' || raw.score === null || raw.score === undefined ? null : Number(raw.score);
      ensure(validScore(score, row.maxScore), `Nilai ${row.itemCode} harus 0–${row.maxScore}.`);
      const applicable = raw.applicable === undefined ? row.applicable : bool(raw.applicable);
      const note = text(raw.note, 'Catatan', 1000, true);
      if (score !== row.score || applicable !== row.applicable || note !== row.note) {
        await tx.csmsAssessmentScore.update({ where: { id: row.id }, data: { score: applicable ? score : null, applicable, note } });
        changes.push({ item: row.itemCode, from: row.score, to: applicable ? score : 'N/A' });
      }
    }
    const meta = {};
    if (body.periodLabel !== undefined) meta.periodLabel = text(body.periodLabel, 'Periode assessment', 80);
    if (body.assessors !== undefined) meta.assessors = text(body.assessors, 'Penilai', 300);
    if (body.notes !== undefined) meta.notes = text(body.notes, 'Catatan', 3000, true);
    if (Object.keys(meta).length) await tx.csmsAssessment.update({ where: { id }, data: meta });
    if (changes.length || Object.keys(meta).length) await audit(tx, user, { action: 'UPDATE', module: 'csms', recordId: id, siteId: a.siteId, after: { changes: changes.slice(0, 100), ...meta }, note: `Nilai assessment ${a.number}` });
    return { changed: changes.length };
  }, { timeout: 30000 });
}

/** Finalisasi: semua butir berlaku wajib dinilai; total & bukti disalin lalu dikunci. */
export async function finalizeAssessment(user, id) {
  requireManager(user);
  const result = await prisma.$transaction(async (tx) => {
    const a = await draftOf(tx, id);
    const scores = await tx.csmsAssessmentScore.findMany({ where: { assessmentId: id } });
    const totals = assessmentTotals(scores, a.template.naPolicy);
    ensure(totals.unscored === 0, `${totals.unscored} butir berlaku belum dinilai.`);
    const live = await liveEvidence(a.applicationId);
    for (const s of scores) await tx.csmsAssessmentScore.update({ where: { id: s.id }, data: { evidence: live[s.itemId] ?? { items: [] } } });
    const row = await tx.csmsAssessment.update({
      where: { id },
      data: { status: 'FINAL', finalizedAt: new Date(), finalizedByName: actorName(user), totalScore: totals.total, maxScore: totals.max, percent: totals.percent },
    });
    if (a.revisionOfId) await tx.csmsAssessment.update({ where: { id: a.revisionOfId }, data: { supersededAt: new Date() } });
    await audit(tx, user, { action: 'APPROVE', module: 'csms', recordId: id, siteId: a.siteId, before: { status: 'DRAFT' }, after: { status: 'FINAL', ...totals }, note: `Finalisasi assessment ${a.number}` });
    return row;
  }, { timeout: 30000 });
  await notifyRoles(prisma, ['HSE_SITE', 'PJO', 'PM'], result.siteId, { type: 'CSMS', title: `Assessment internal ${result.number} final`, body: `Nilai ${result.totalScore}/${result.maxScore} (${result.percent}%) — assessment internal PJM, bukan keputusan owner.`, link: `/csms/assessments/${id}`, dedupeKey: `csms-assessment-${id}-final` });
  return result;
}

/** Koreksi assessment final: revisi baru (draft) menyalin nilai sebelumnya; versi lama tetap tersimpan. */
export async function reviseAssessment(user, id, body) {
  requireManager(user);
  object(body, ['reason']);
  const reason = text(body.reason, 'Alasan revisi', 1000);
  return prisma.$transaction(async (tx) => {
    const a = await tx.csmsAssessment.findUnique({ where: { id }, include: { scores: true, revisions: { select: { status: true } } } });
    ensure(a, 'Assessment tidak ditemukan.', 404);
    ensure(a.status === 'FINAL' && !a.supersededAt, 'Hanya versi final terakhir yang dapat direvisi.', 409);
    ensure(!a.revisions.some((r) => r.status === 'DRAFT'), 'Masih ada revisi draft untuk assessment ini.', 409);
    const revisionNo = a.revisionNo + 1;
    const rev = await tx.csmsAssessment.create({
      data: {
        number: `${a.number.replace(/-R\d+$/, '')}-R${revisionNo}`, siteId: a.siteId, applicationId: a.applicationId, templateId: a.templateId,
        periodLabel: a.periodLabel, assessmentDate: a.assessmentDate, assessors: a.assessors, notes: a.notes, riskLevel: a.riskLevel,
        revisionNo, revisionOfId: a.id, revisionReason: reason, createdById: user.id, createdByName: actorName(user),
      },
    });
    await tx.csmsAssessmentScore.createMany({ data: a.scores.map(({ id: sid, assessmentId, evidence, ...s }) => { void sid; void assessmentId; void evidence; return { ...s, assessmentId: rev.id }; }) });
    await audit(tx, user, { action: 'CREATE', module: 'csms', recordId: rev.id, siteId: a.siteId, after: { revisionOf: a.number, revisionNo, reason }, note: `Revisi assessment ${a.number}` });
    return rev;
  }, { timeout: 30000 });
}

export async function deleteDraftAssessment(user, id) {
  requireManager(user);
  return prisma.$transaction(async (tx) => {
    const a = await draftOf(tx, id);
    ensure(!(await tx.csmsFinding.count({ where: { assessmentId: id } })), 'Assessment memiliki temuan; tidak dapat dihapus.', 409);
    await tx.csmsAssessment.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'csms', recordId: id, siteId: a.siteId, before: { number: a.number }, note: 'Hapus draft assessment' });
    return { id };
  });
}
