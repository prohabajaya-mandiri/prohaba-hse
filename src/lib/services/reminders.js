import { prisma } from '../prisma.js';
import { addDays, daysBetween, iso, today } from '../dates.js';
import { cycleStart, nextLeaveDue, pickPolicy } from '../domain/roster.js';
import { previousMonthKey, reportPeriod, sitesNotReported } from '../domain/reports.js';
import { getSettings } from '../settings.js';
import { SETTING_DEFAULTS } from '../settings-defaults.js';
import { notifyRoles } from './notify.js';
import { requirementReminders } from './csms.js';
import { findingReminders } from './csms-findings.js';
import { workPermitReminders } from './work-permits.js';

const HSE = ['HO_HSE', 'HSE_SITE'];
const when = (left) => (left < 0 ? `lewat ${-left} hari` : left === 0 ? 'hari ini' : `${left} hari lagi`);

/**
 * Memindai jatuh tempo dan membuat notifikasi di aplikasi. Idempoten: dedupeKey mencegah duplikasi.
 * Dijalankan oleh Vercel Cron (/api/cron/reminders) dan secara malas maksimal sekali per jam.
 */
export async function runReminders(now = today()) {
  const s = await getSettings(['reminder.thresholds', 'report.monthlyDeadlineDay', 'csms.reminders']);
  const t = s['reminder.thresholds'];
  let created = 0;
  const push = async (roles, siteId, payload) => (created += await notifyRoles(prisma, roles, siteId, payload));

  // MCU annual & Follow Up H-7 (hanya catatan MCU terbaru per personel aktif).
  const mcus = await prisma.mcuRecord.findMany({
    where: { isLatest: true, personnel: { isFormer: false }, OR: [{ result: 'FIT', validUntil: { lte: addDays(now, t.mcuAnnual) } }, { result: 'FOLLOW_UP', fuDueDate: { lte: addDays(now, t.followUp) } }] },
    include: { personnel: { select: { name: true, currentSiteId: true } } },
  });
  for (const m of mcus) {
    const fu = m.result === 'FOLLOW_UP';
    const due = fu ? m.fuDueDate : m.validUntil;
    const left = daysBetween(now, due);
    await push(HSE, m.personnel.currentSiteId, {
      type: fu ? 'FOLLOW_UP' : 'MCU_ANNUAL', title: `${fu ? 'Follow Up MCU' : 'MCU annual'} ${m.personnel.name}`,
      body: `Jatuh tempo ${iso(due)} (${when(left)}).`, link: `/mcu?personnelId=${m.personnelId}`, severity: left < 0 ? 'DANGER' : 'WARNING',
      dedupeKey: `${fu ? 'fu' : 'mcu'}-${m.id}-${left < 0 ? 'late' : 'due'}`, dueDate: due,
    });
  }

  // Permit/SKS akan habis atau kedaluwarsa (yang belum diperpanjang). Permit FU yang habis → FU ulang.
  const permits = await prisma.permit.findMany({
    where: { revokedAt: null, endDate: { lte: addDays(now, t.permit), gte: addDays(now, -30) }, personnel: { isFormer: false } },
    include: { personnel: { select: { name: true } } },
  });
  const renewed = new Set((await prisma.permit.findMany({ where: { previousId: { in: permits.map((p) => p.id) } }, select: { previousId: true } })).map((p) => p.previousId));
  for (const p of permits.filter((x) => !renewed.has(x.id))) {
    const left = daysBetween(now, p.endDate);
    await push(HSE, p.siteId, {
      type: 'PERMIT', title: `${p.kind === 'SKS' ? 'SKS' : 'Permit'} ${p.number} — ${p.personnel.name}`,
      body: `${p.permitType} berakhir ${iso(p.endDate)} (${when(left)}).${p.isTemporary || p.basisResult === 'FOLLOW_UP' ? ' Status Follow Up: jadwalkan FU ulang.' : ''}`,
      link: `/permits?personnelId=${p.personnelId}`, severity: left < 0 ? 'DANGER' : 'WARNING', dedupeKey: `permit-${p.id}-${left < 0 ? 'late' : 'due'}`, dueDate: p.endDate,
    });
  }

  // Sertifikat kompetensi.
  const certs = await prisma.personnelCertificate.findMany({
    where: { expiryDate: { lte: addDays(now, t.certificate), gte: addDays(now, -30) }, personnel: { isFormer: false } },
    include: { personnel: { select: { name: true, currentSiteId: true } }, competency: { select: { name: true } } },
  });
  for (const c of certs) {
    const left = daysBetween(now, c.expiryDate);
    await push([...HSE, 'HRD'], c.personnel.currentSiteId, {
      type: 'CERTIFICATE', title: `Sertifikat ${c.competency.name} — ${c.personnel.name}`, body: `Berlaku sampai ${iso(c.expiryDate)} (${when(left)}).`,
      link: `/training?tab=certificates&personnelId=${c.personnelId}`, severity: left < 0 ? 'DANGER' : 'WARNING', dedupeKey: `cert-${c.id}-${left < 0 ? 'late' : 'due'}`, dueDate: c.expiryDate,
    });
  }

  // Roster: jadwal cuti mendekat / terlewat.
  const [placements, policies] = await Promise.all([
    prisma.placement.findMany({
      where: { status: 'ACTIVE' },
      include: { personnel: { select: { id: true, name: true, category: true, maritalStatus: true, leaves: { where: { status: { in: ['SELESAI', 'BERJALAN', 'RENCANA'] } }, orderBy: { startDate: 'desc' }, take: 5 } } } },
    }),
    prisma.rosterPolicy.findMany({ where: { isActive: true } }),
  ]);
  for (const pl of placements) {
    const p = pl.personnel;
    if (p.leaves.some((l) => ['BERJALAN', 'RENCANA'].includes(l.status))) continue;
    const policy = pickPolicy(policies, { siteId: pl.siteId, category: p.category, maritalStatus: p.maritalStatus });
    const due = nextLeaveDue(policy, cycleStart(pl.startDate, p.leaves.filter((l) => l.status === 'SELESAI')));
    if (!due || daysBetween(now, due) > t.roster) continue;
    const left = daysBetween(now, due);
    await push(['HSE_SITE', 'PJO'], pl.siteId, {
      type: 'ROSTER', title: `Jadwal cuti ${p.name}`, body: `Siklus onsite ${policy.onsiteDays} hari berakhir ${iso(due)} (${when(left)}). Rencanakan cuti/off.`,
      link: `/roster?personnelId=${p.id}`, severity: left < 0 ? 'DANGER' : 'INFO', dedupeKey: `roster-${p.id}-${iso(due)}-${left < 0 ? 'late' : 'due'}`, dueDate: due,
    });
  }

  // Laporan bulanan batas tanggal 10: pengingat 5 hari sebelum batas, eskalasi ke HO setelah lewat.
  const period = previousMonthKey(now);
  const p = reportPeriod('BULANAN', period, s['report.monthlyDeadlineDay']);
  const left = daysBetween(now, p.dueDate);
  if (left <= 5) {
    const [sites, reports] = await Promise.all([
      prisma.site.findMany({ where: { isActive: true, isHo: false }, select: { id: true, code: true, name: true, isHo: true } }),
      prisma.hseReport.findMany({ where: { type: 'BULANAN', periodKey: period }, select: { siteId: true, type: true, periodKey: true, status: true } }),
    ]);
    for (const site of sitesNotReported(sites, reports, period)) {
      await push(left < 0 ? ['HSE_SITE', 'HO_HSE', 'PJO', 'PM'] : ['HSE_SITE'], site.id, {
        type: 'REPORT_DUE', title: `Laporan bulanan ${period} — ${site.code}`, body: `Batas pengiriman ${iso(p.dueDate)} (${when(left)}).`,
        link: '/reports', severity: left < 0 ? 'DANGER' : 'WARNING', dedupeKey: `report-due-${site.id}-${period}-${left < 0 ? 'late' : 'due'}`, dueDate: p.dueDate,
      });
    }
  }

  // Dokumen HSE yang memiliki masa berlaku.
  const docs = await prisma.hseDocument.findMany({ where: { status: { not: 'ARSIP' }, validUntil: { not: null, lte: addDays(now, t.document), gte: addDays(now, -30) } } });
  for (const d of docs) {
    const l = daysBetween(now, d.validUntil);
    await push(['HO_HSE', ...(d.siteId ? ['HSE_SITE'] : [])], d.siteId, {
      type: 'DOCUMENT', title: `Dokumen ${d.number} — ${d.title}`, body: `Berlaku sampai ${iso(d.validUntil)} (${when(l)}).`,
      link: '/documents?expiry=' + (l < 0 ? 'expired' : 'soon'), severity: l < 0 ? 'DANGER' : 'WARNING', dedupeKey: `doc-${d.id}-${iso(d.validUntil)}-${l < 0 ? 'late' : 'due'}`, dueDate: d.validUntil,
    });
  }

  // CSMS: tenggat butir, bukti kedaluwarsa, dan temuan (zona waktu site). Ambang dari parameter csms.reminders.
  const csmsCfg = { ...SETTING_DEFAULTS['csms.reminders'].value, ...s['csms.reminders'] };
  await requirementReminders(push, csmsCfg);
  await findingReminders(push, csmsCfg);
  await workPermitReminders(push);

  await prisma.setting.upsert({
    where: { key: 'system.lastReminderRun' },
    create: { key: 'system.lastReminderRun', value: { at: new Date().toISOString(), created }, status: 'APPROVED' },
    update: { value: { at: new Date().toISOString(), created } },
  });
  return { created };
}

export async function maybeRunReminders() {
  try {
    const last = await prisma.setting.findUnique({ where: { key: 'system.lastReminderRun' } });
    if (last && Date.now() - new Date(last.value.at).getTime() < 3600_000) return null;
    return await runReminders();
  } catch (error) {
    console.error('Reminder scan failed', error.message);
    return null;
  }
}
