// Bukti CSMS dari data modul yang sudah ada (tanpa input ulang). Ringkasan dihitung ulang di server
// saat ditautkan dan disimpan sebagai snapshot; tautan ke halaman asal tetap mengikuti hak akses modul itu.
import { prisma } from '../prisma.js';
import { canAccess } from '../access.js';
import { addDays, iso, today } from '../dates.js';
import { SOURCE_TYPES } from '../domain/csms.js';
import { fitness } from '../domain/mcu.js';
import { summarize } from '../domain/performance.js';
import { labelOf } from '../labels.js';
import { ensure, InputError } from '../validation.js';
import { sourceData } from './performance.js';
import { centerFetch, centerPublicUrl } from '../center-client.js';

const fmt = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(n ?? 0));
const range = (start, end) => `${iso(start)} s/d ${iso(end)}`;
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

const DUE_LABELS = { TERLAMBAT: 'servis terlambat', MENDEKATI: 'servis ≤14 hari', TERJADWAL: 'terjadwal (tanggal)', TERJADWAL_METER: 'terjadwal (HM/KM)', TANPA_JADWAL: 'tanpa jadwal' };

const BUILDERS = {
  // Data alat & pemeliharaan dicatat di ERP Center (Logistik → Perawatan & servis); E-HSE hanya membaca.
  async EQUIPMENT({ siteId, start, end, user }) {
    const from = end.getTime() - start.getTime() > 399 * 86400000 ? addDays(end, -399) : start;
    const data = await centerFetch(user, '/equipment', { hseSiteId: siteId, from: iso(from), to: iso(end) });
    if (!data?.units?.length) return [];
    const s = data.summary;
    const due = Object.entries(s.byDue).map(([k, v]) => `${DUE_LABELS[k] ?? k} ${v}`).join(', ');
    return [{
      key: 'EQUIPMENT:RECAP', title: `Daftar alat & status pemeliharaan (ERP) ${range(from, end)}`,
      summary: `${s.units} unit (${Object.entries(s.byType).map(([k, v]) => `${labelOf(k)} ${v}`).join(', ')}); ${due}; ${s.servicesInPeriod} catatan servis dalam periode`,
      link: centerPublicUrl() ? `${centerPublicUrl()}/logistik?tab=maintenance` : null,
      snapshot: {
        from: iso(from), to: iso(end), source: 'ERP Center', projects: data.projects.map((p) => p.code), definition: data.definition, summary: s,
        units: data.units.map((u) => ({ code: u.code, name: u.name, type: u.type, due: u.service.due, nextServiceDate: iso(u.service.nextServiceDate), nextServiceMeter: u.service.nextServiceMeter, lastServiceDate: iso(u.service.lastServiceDate), servicesInPeriod: u.service.servicesInPeriod })),
      },
    }];
  },
  async ACTIVITY({ siteId, start, end }) {
    const [rows, indicators] = await Promise.all([
      prisma.hseActivity.groupBy({ by: ['indicatorCode'], where: { siteId, date: { gte: start, lte: end } }, _sum: { count: true, participants: true }, _count: true }),
      prisma.indicator.findMany({ select: { code: true, name: true, hasParticipants: true } }),
    ]);
    const names = Object.fromEntries(indicators.map((i) => [i.code, i]));
    return rows.map((r) => {
      const ind = names[r.indicatorCode];
      const snapshot = { indicator: r.indicatorCode, count: r._sum.count ?? 0, participants: r._sum.participants ?? 0, entries: r._count, from: iso(start), to: iso(end) };
      return {
        key: `ACTIVITY:${r.indicatorCode}`, indicator: r.indicatorCode, title: `${ind?.name ?? r.indicatorCode} ${range(start, end)}`,
        summary: `${fmt(snapshot.count)} kali${ind?.hasParticipants ? `, ${fmt(snapshot.participants)} peserta` : ''} (${snapshot.entries} catatan)`,
        link: `/performance?${qs({ tab: 'activities', siteId, from: iso(start), to: iso(end), indicatorCode: r.indicatorCode })}`, snapshot,
      };
    });
  },
  async PERFORMANCE({ siteId, start, end }) {
    const s = summarize(await sourceData({ siteId }, start, end));
    if (!s.days && !Object.keys(s.incidents).length) return [];
    const inc = Object.entries(s.incidents).map(([k, v]) => `${labelOf(k)} ${v}`).join(', ') || 'tanpa kejadian';
    return [{
      key: 'PERFORMANCE:RECAP', title: `Statistik K3 ${range(start, end)}`,
      summary: `Manhours ${fmt(s.manhours)} (${s.days} hari terinput); ${inc}; LTIFR ${fmt(s.ltifr)} per 1.000.000 jam kerja`,
      link: `/performance?${qs({ tab: 'recap', siteId, from: iso(start), to: iso(end), granularity: 'monthly' })}`,
      snapshot: { from: iso(start), to: iso(end), manhours: s.manhours, days: s.days, incidents: s.incidents, ltifr: s.ltifr, severityRate: s.severityRate },
    }];
  },
  async REPORT({ siteId, start, end }) {
    const rows = await prisma.hseReport.findMany({ where: { siteId, periodStart: { lte: end }, periodEnd: { gte: start } }, orderBy: { periodStart: 'asc' }, select: { id: true, type: true, periodKey: true, status: true, approvedAt: true, approverName: true } });
    return rows.map((r) => ({
      key: `REPORT:${r.id}`, title: `Laporan ${labelOf(r.type).toLowerCase()} ${r.periodKey}`,
      summary: r.status === 'APPROVED' ? `Disahkan HO ${iso(r.approvedAt)} oleh ${r.approverName ?? '-'}` : `Status: ${labelOf(r.status)} (belum disahkan HO)`,
      link: `/reports/${r.id}`, snapshot: { reportId: r.id, type: r.type, periodKey: r.periodKey, status: r.status, approvedAt: iso(r.approvedAt) },
    }));
  },
  async INCIDENT({ siteId, start, end }) {
    const rows = await prisma.incident.findMany({
      where: { siteId, occurredAt: { gte: start, lt: addDays(end, 1) } }, orderBy: { occurredAt: 'asc' },
      select: { id: true, number: true, title: true, category: true, status: true, investigator: true, rootCause: true, actions: { select: { status: true, type: true } } },
    });
    if (!rows.length) return [];
    const done = (r) => r.actions.filter((a) => a.status === 'DONE').length;
    const recap = {
      key: 'INCIDENT:RECAP', title: `Rekap insiden & tindak lanjut ${range(start, end)}`,
      summary: `${rows.length} insiden; ${rows.filter((r) => r.investigator || r.rootCause).length} terinvestigasi; tindakan selesai ${rows.reduce((s, r) => s + done(r), 0)}/${rows.reduce((s, r) => s + r.actions.length, 0)}`,
      link: `/incidents?${qs({ siteId, from: iso(start), to: iso(end) })}`,
      snapshot: { from: iso(start), to: iso(end), incidents: rows.map((r) => ({ number: r.number, category: r.category, status: r.status, actions: r.actions.length, done: done(r) })) },
    };
    return [recap, ...rows.map((r) => ({
      key: `INCIDENT:${r.id}`, title: `${r.number} — ${r.title}`,
      summary: `${labelOf(r.category)} · ${labelOf(r.status)} · investigasi ${r.investigator || r.rootCause ? 'ada' : 'belum'} · tindakan ${done(r)}/${r.actions.length} selesai`,
      link: `/incidents?${qs({ q: r.number })}`, snapshot: { incidentId: r.id, number: r.number, category: r.category, status: r.status, investigated: Boolean(r.investigator || r.rootCause), actions: r.actions.length, done: done(r) },
    }))];
  },
  async TRAINING({ siteId, start, end }) {
    const rows = await prisma.trainingSession.findMany({
      where: { siteId, startDate: { gte: start, lte: end }, status: { not: 'BATAL' } }, orderBy: { startDate: 'asc' },
      select: { id: true, title: true, startDate: true, status: true, competency: { select: { name: true } }, participants: { select: { attended: true } } },
    });
    return rows.map((r) => {
      const attended = r.participants.filter((p) => p.attended).length;
      return {
        key: `TRAINING:${r.id}`, title: `${r.title} (${iso(r.startDate)})`,
        summary: `${r.competency?.name ? r.competency.name + ' · ' : ''}${labelOf(r.status)} · hadir ${attended}/${r.participants.length} peserta`,
        link: `/training?${qs({ tab: 'sessions', siteId })}`, snapshot: { sessionId: r.id, title: r.title, date: iso(r.startDate), status: r.status, participants: r.participants.length, attended },
      };
    });
  },
  async CERTIFICATE({ siteId, now }) {
    const certs = await prisma.personnelCertificate.findMany({ where: { personnel: { currentSiteId: siteId, isFormer: false } }, select: { expiryDate: true, personnelId: true, competency: { select: { name: true } } } });
    if (!certs.length) return [];
    const soon = addDays(now, 30);
    const by = {};
    for (const c of certs) {
      const row = (by[c.competency.name] ??= { valid: 0, expiring: 0, expired: 0 });
      if (c.expiryDate && c.expiryDate < now) row.expired++; else if (c.expiryDate && c.expiryDate <= soon) row.expiring++; else row.valid++;
    }
    const total = Object.values(by).reduce((s, r) => ({ valid: s.valid + r.valid, expiring: s.expiring + r.expiring, expired: s.expired + r.expired }), { valid: 0, expiring: 0, expired: 0 });
    return [{
      key: 'CERTIFICATE:RECAP', title: `Daftar sertifikat kompetensi personel per ${iso(now)}`,
      summary: `${certs.length} sertifikat (${new Set(certs.map((c) => c.personnelId)).size} personel): berlaku ${total.valid}, habis ≤30 hari ${total.expiring}, kedaluwarsa ${total.expired}`,
      link: `/training?${qs({ tab: 'certificates', siteId })}`, snapshot: { asOf: iso(now), byCompetency: by, total },
    }];
  },
  async COMPETENCY({ siteId, now }) {
    const people = await prisma.personnel.findMany({ where: { currentSiteId: siteId, isFormer: false }, select: { id: true, position: true, certificates: { select: { competencyId: true, expiryDate: true } } } });
    const positions = [...new Set(people.map((p) => p.position))];
    const reqs = await prisma.positionRequirement.findMany({ where: { position: { in: positions } }, select: { position: true, competencyId: true } });
    if (!reqs.length) return [];
    let required = 0, fulfilled = 0;
    for (const p of people) {
      for (const r of reqs.filter((x) => x.position === p.position)) {
        required++;
        if (p.certificates.some((c) => c.competencyId === r.competencyId && (!c.expiryDate || c.expiryDate >= now))) fulfilled++;
      }
    }
    return [{
      key: 'COMPETENCY:RECAP', title: `Matriks kompetensi per jabatan per ${iso(now)}`,
      summary: `${new Set(reqs.map((r) => r.position)).size} jabatan bermatriks; kebutuhan terpenuhi ${fulfilled}/${required} (kekurangan ${required - fulfilled} = kebutuhan training)`,
      link: `/training?${qs({ tab: 'gaps', siteId })}`, snapshot: { asOf: iso(now), positions: new Set(reqs.map((r) => r.position)).size, required, fulfilled },
    }];
  },
  // Hanya status kelayakan agregat; tanpa nama, catatan atau dokumen medis.
  async MCU({ siteId, now }) {
    const people = await prisma.personnel.findMany({ where: { currentSiteId: siteId, isFormer: false }, select: { mcus: { where: { isLatest: true }, select: { result: true, validUntil: true, fuDueDate: true }, take: 1 } } });
    if (!people.length) return [];
    const counts = {};
    for (const p of people) { const f = fitness(p.mcus[0], now); counts[f] = (counts[f] ?? 0) + 1; }
    return [{
      key: 'MCU:RECAP', title: `Status MCU personel per ${iso(now)}`,
      summary: Object.entries(counts).map(([k, v]) => `${labelOf(k)} ${v}`).join(', ') + ` (dari ${people.length} personel)`,
      link: `/mcu?${qs({ siteId })}`, snapshot: { asOf: iso(now), personnel: people.length, counts },
    }];
  },
  async WORK_PERMIT({ siteId, start, end }) {
    const rows = await prisma.workPermit.findMany({ where: { siteId, startAt: { lte: addDays(end, 1) }, endAt: { gte: start }, status: { not: 'DIBATALKAN' } }, orderBy: { startAt: 'asc' }, select: { id: true, number: true, permitType: true, status: true, startAt: true, endAt: true, closedAt: true } });
    if (!rows.length) return [];
    const byType = {};
    for (const r of rows) byType[r.permitType] = (byType[r.permitType] ?? 0) + 1;
    return [{
      key: 'WORK_PERMIT:RECAP', title: `Izin kerja khusus ${range(start, end)}`,
      summary: `${rows.length} izin (${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}); ditutup ${rows.filter((r) => r.status === 'DITUTUP').length}`,
      link: `/work-permits?${qs({ siteId })}`, snapshot: { from: iso(start), to: iso(end), permits: rows.map((r) => ({ number: r.number, type: r.permitType, status: r.status, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString() })) },
    }, ...rows.map((r) => ({
      key: `WORK_PERMIT:${r.id}`, title: `${r.number} — ${r.permitType}`, summary: `${labelOf(r.status)} · ${iso(r.startAt)} s/d ${iso(r.endAt)}`,
      link: `/work-permits?${qs({ q: r.number })}`, snapshot: { permitId: r.id, number: r.number, type: r.permitType, status: r.status },
    }))];
  },
  async FINDING({ siteId, start, end }) {
    const rows = await prisma.csmsFinding.findMany({ where: { siteId, status: 'DITUTUP', closedAt: { gte: start, lt: addDays(end, 1) } }, select: { number: true, source: true, closedAt: true } });
    if (!rows.length) return [];
    return [{
      key: 'FINDING:RECAP', title: `Temuan ditutup ${range(start, end)}`,
      summary: `${rows.length} temuan ditutup setelah verifikasi: ${rows.map((r) => r.number).join(', ').slice(0, 300)}`,
      link: `/csms?${qs({ tab: 'verify', siteId, fstatus: 'DITUTUP' })}`, snapshot: { from: iso(start), to: iso(end), findings: rows.map((r) => ({ number: r.number, source: r.source, closedAt: iso(r.closedAt) })) },
    }];
  },
};

/** Rentang data untuk periode butir: periode berkala = periodenya; sekali/perubahan = sejak penerapan sampai hari ini. */
export function sourceRange(period, application, now) {
  if (period.periodKey === 'AWAL') return { start: application.startDate, end: now };
  return { start: period.start, end: period.end < now ? period.end : now };
}

/** Opsi bukti dari modul untuk satu butir & periode, dikelompokkan per jenis sumber. */
export async function buildSourceOptions(user, { siteId, start, end, types }) {
  const now = today();
  const out = [];
  for (const type of types) {
    if (!Object.hasOwn(BUILDERS, type) || !canAccess(user.role, SOURCE_TYPES[type].module)) continue;
    try {
      out.push({ type, label: SOURCE_TYPES[type].label, options: await BUILDERS[type]({ siteId, start, end, now, user }) });
    } catch (error) {
      // Sumber dari aplikasi lain (ERP) bisa belum dikonfigurasi atau tidak terjangkau: tampilkan alasannya, sumber lain tetap jalan.
      if (!(error instanceof InputError)) throw error;
      out.push({ type, label: SOURCE_TYPES[type].label, options: [], note: error.message });
    }
  }
  return out;
}

export async function resolveSource(user, ctx, key) {
  const type = String(key ?? '').split(':')[0];
  ensure(Object.hasOwn(BUILDERS, type), 'Jenis sumber tidak dikenal.');
  if (!canAccess(user.role, SOURCE_TYPES[type].module)) throw new InputError('Anda tidak memiliki akses ke modul sumber ini.', 403);
  const [group] = await buildSourceOptions(user, { ...ctx, types: [type] });
  const option = group?.options.find((o) => o.key === key);
  ensure(option, 'Data sumber tidak ditemukan untuk periode ini.', 404);
  return { type, ...option };
}
