// Data administrasi perusahaan & site untuk owner (acuan AMM-VIB1-F-SHE-008B).
// Data diambil dari sumber utamanya: penanggung jawab dari Site & Proyek, manpower dari penempatan aktif.
import { prisma } from '../prisma.js';
import { canManageCsms, canSeeSite, siteScope } from '../access.js';
import { actorName, audit, diff } from '../audit.js';
import { ensure, InputError, object, optionalChoice, optionalDate, text } from '../validation.js';

export const RISK_LEVELS = ['RENDAH', 'SEDANG', 'TINGGI'];
export const MANPOWER_DEFINITION = 'Penempatan aktif di site per hari ini (semua kategori: Staff, Harian Kantor, Harian Mandor).';

export const getCompanyProfile = () => prisma.companyProfile.findUnique({ where: { id: 'PJM' } });

export async function saveCompanyProfile(user, body) {
  if (!canManageCsms(user)) throw new InputError('Profil & legalitas perusahaan dikelola HO HSE.', 403);
  object(body, ['name', 'hoAddress', 'businessCategory', 'businessScale', 'iujpNumber', 'iujpExpiry', 'notes']);
  const data = {
    name: text(body.name, 'Nama perusahaan', 200),
    hoAddress: text(body.hoAddress, 'Alamat kantor pusat', 500, true),
    businessCategory: optionalChoice(body.businessCategory, ['INTI', 'NON_INTI'], 'Kategori usaha jasa pertambangan'),
    businessScale: optionalChoice(body.businessScale, ['LOKAL', 'NASIONAL'], 'Kategori usaha'),
    iujpNumber: text(body.iujpNumber, 'Nomor IUJP', 100, true),
    iujpExpiry: optionalDate(body.iujpExpiry, 'Masa berlaku IUJP'),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  return prisma.$transaction(async (tx) => {
    const before = await tx.companyProfile.findUnique({ where: { id: 'PJM' } });
    const row = await tx.companyProfile.upsert({ where: { id: 'PJM' }, create: { id: 'PJM', ...data, updatedByName: actorName(user) }, update: { ...data, updatedByName: actorName(user) } });
    await audit(tx, user, { action: before ? 'UPDATE' : 'CREATE', module: 'csms', recordId: 'company-profile', ...(before ? diff(before, data) : { after: data }), note: 'Profil perusahaan (008B)' });
    return row;
  }, { timeout: 20000 });
}

// HSE Site memperbarui data operasional site-nya; departemen user & tingkat risiko ditetapkan HO.
const OPERATIONAL = ['siteAddress', 'province', 'regency', 'workScope'];
const HO_ONLY = ['userDepartment', 'riskLevel'];

export async function saveSiteProfile(user, siteId, body) {
  if (!canSeeSite(user, siteId)) throw new InputError('Site di luar cakupan Anda.', 403);
  const manager = canManageCsms(user);
  ensure(manager || user.role === 'HSE_SITE', 'Anda tidak dapat mengubah profil site.', 403);
  object(body, manager ? [...OPERATIONAL, ...HO_ONLY] : OPERATIONAL);
  const data = {
    siteAddress: text(body.siteAddress, 'Alamat site', 500, true),
    province: text(body.province, 'Provinsi', 100, true),
    regency: text(body.regency, 'Kabupaten', 100, true),
    workScope: text(body.workScope, 'Lingkup pekerjaan', 1000, true),
    ...(manager ? { userDepartment: text(body.userDepartment, 'Departemen user', 150, true), riskLevel: optionalChoice(body.riskLevel, RISK_LEVELS, 'Tingkat risiko pekerjaan') } : {}),
  };
  return prisma.$transaction(async (tx) => {
    ensure(await tx.site.findUnique({ where: { id: siteId } }), 'Site tidak ditemukan.', 404);
    const before = await tx.siteCsmsProfile.findUnique({ where: { siteId } });
    const row = await tx.siteCsmsProfile.upsert({ where: { siteId }, create: { siteId, ...data, updatedByName: actorName(user) }, update: { ...data, updatedByName: actorName(user) } });
    const d = before ? diff(before, data) : { after: data, changed: true };
    if (d.changed) await audit(tx, user, { action: before ? 'UPDATE' : 'CREATE', module: 'csms', recordId: siteId, siteId, before: d.before ?? null, after: d.after, note: 'Profil site (008B)' });
    return row;
  }, { timeout: 20000 });
}

const current = (responsibles, role) => responsibles.find((r) => r.role === role && !r.endDate) ?? null;

/** Satu baris per site (format 008B). Kolom kosong ditandai agar HO tahu data yang belum lengkap. */
export async function administrationRows(user) {
  const scope = siteScope(user);
  const [company, sites, manpower] = await Promise.all([
    getCompanyProfile(),
    prisma.site.findMany({
      where: { isActive: true, isHo: false, ...(scope === null ? {} : { id: { in: scope } }) },
      orderBy: { name: 'asc' },
      include: {
        csmsProfile: true,
        responsibles: { where: { endDate: null } },
        csmsApplications: { where: { status: 'ACTIVE' }, select: { ownerRegisterNo: true, template: { select: { code: true, ownerName: true } } } },
      },
    }),
    prisma.placement.findMany({ where: { status: 'ACTIVE', personnel: { isFormer: false } }, select: { siteId: true, personnel: { select: { category: true } } } }),
  ]);
  const mp = {};
  for (const pl of manpower) {
    const m = (mp[pl.siteId] ??= { total: 0, byCategory: {} });
    m.total++;
    m.byCategory[pl.personnel.category] = (m.byCategory[pl.personnel.category] ?? 0) + 1;
  }
  return {
    company, definition: MANPOWER_DEFINITION,
    rows: sites.map((s) => {
      const pjo = current(s.responsibles, 'PJO');
      const so = current(s.responsibles, 'SAFETY_OFFICER');
      const p = s.csmsProfile ?? {};
      const row = {
        siteId: s.id, siteCode: s.code, siteName: s.name, timezone: s.timezone,
        registerNo: s.csmsApplications.map((a) => a.ownerRegisterNo).filter(Boolean).join(', ') || null,
        owners: [...new Set(s.csmsApplications.map((a) => a.template.ownerName))].join(', ') || null,
        companyName: company?.name ?? null, userDepartment: p.userDepartment ?? null,
        pjoName: pjo?.name ?? null, pjoCompetency: pjo?.competency ?? null, pjoApprovalNo: pjo?.approvalNo ?? null, pjoApprovalDate: pjo?.approvalDate ?? null,
        businessCategory: company?.businessCategory ?? null, iujpNumber: company?.iujpNumber ?? null, iujpExpiry: company?.iujpExpiry ?? null,
        pjoEmail: pjo?.email ?? null, pjoPhone: pjo?.phone ?? null,
        safetyOfficer: so?.name ?? null, safetyOfficerPhone: so?.phone ?? null, safetyOfficerEmail: so?.email ?? null,
        hoAddress: company?.hoAddress ?? null, siteAddress: p.siteAddress ?? null, province: p.province ?? null, regency: p.regency ?? null,
        businessScale: company?.businessScale ?? null, riskLevel: p.riskLevel ?? null, workScope: p.workScope ?? null,
        manpower: mp[s.id]?.total ?? 0,
        manpowerByCategory: mp[s.id]?.byCategory ?? {},
        profile: s.csmsProfile,
      };
      const required = ['companyName', 'userDepartment', 'pjoName', 'pjoCompetency', 'pjoApprovalNo', 'businessCategory', 'iujpNumber', 'iujpExpiry', 'safetyOfficer', 'hoAddress', 'siteAddress', 'province', 'regency', 'businessScale', 'riskLevel', 'workScope'];
      return { ...row, missing: required.filter((k) => !row[k]) };
    }),
  };
}
