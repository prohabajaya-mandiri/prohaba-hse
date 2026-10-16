// Data referensi E-HSE (idempoten, tidak menghapus data). Akun HO HSE pertama dibuat bila belum ada.
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { DISCUSSED_SCENARIO } from '../src/lib/domain/hrd.js';

// Referensi awal dari dokumen requirement; status aktif & wilayah wajib diverifikasi saat implementasi.
const SITES = [
  ['HO', 'Head Office', 'HO', true],
  ['TBG', 'Tabang', 'TIMUR'],
  ['KTM', 'Kotim', 'TIMUR'],
  ['LHT', 'Lahat', 'BARAT'],
  ['ACH', 'Aceh', 'BARAT'],
  ['KTG', 'Katingan', 'TIMUR'],
  ['TNB', 'Tanah Bumbu', 'TIMUR'],
  ['KSG', 'Kasongan', 'TIMUR'],
  ['PRC', 'Puruk Cahu', 'TIMUR'],
  ['SRW', 'Sorowako/Morowali', 'TIMUR'],
];

const INDICATORS = [
  ['TBM', 'Toolbox Meeting', 'ACTIVITY', 'kali', true],
  ['SAFETY_TALK', 'Safety Talk', 'ACTIVITY', 'kali', true],
  ['INDUCTION', 'Induction', 'ACTIVITY', 'kali', true],
  ['PATROL', 'Safety Patrol', 'ACTIVITY', 'kali', false],
  ['INSPECTION', 'Inspection', 'ACTIVITY', 'kali', false],
  ['TRAINING', 'Training', 'ACTIVITY', 'kali', true],
  ['UNSAFE_ACT', 'Unsafe Act', 'OBSERVATION', 'temuan', false],
  ['UNSAFE_CONDITION', 'Unsafe Condition', 'OBSERVATION', 'temuan', false],
  ['NEAR_MISS', 'Near Miss', 'INCIDENT', 'kejadian', false],
  ['FAC', 'First Aid Case (FAC)', 'INCIDENT', 'kejadian', false],
  ['MTC', 'Medical Treatment Case (MTC)', 'INCIDENT', 'kejadian', false],
  ['LTI', 'Lost Time Injury (LTI)', 'INCIDENT', 'kejadian', false],
  ['FATALITY', 'Fatality', 'INCIDENT', 'kejadian', false],
];

const POLICIES = [
  ['Staff menikah — 3 bulan + 2 minggu', 'STAFF', 'MENIKAH', 90, 14, false, true],
  ['Staff belum menikah — 4 bulan + 2 minggu', 'STAFF', 'BELUM_MENIKAH', 120, 14, false, true],
  ['Manpower — 5 bulan + 2 minggu (kebutuhan proyek)', 'MANPOWER', null, 150, 14, false, true],
  ['Contoh aturan owner — 70 hari kerja + 2 minggu off', 'MANPOWER', null, 70, 14, true, false],
];

const COMPETENCIES = [
  ['INDUKSI', 'Induksi K3 Site', 'WAJIB_SITE', 12],
  ['FIRST_AID', 'First Aid', 'K3', 24],
  ['AK3U', 'Ahli K3 Umum', 'K3', 36],
  ['POP', 'Pengawas Operasional Pertama (POP)', 'K3', null],
];

try {
  for (const [code, name, region, isHo] of SITES) {
    await prisma.site.upsert({ where: { code }, create: { code, name, region, isHo: Boolean(isHo) }, update: {} });
  }
  for (const [i, [code, name, group, unit, hasParticipants]] of INDICATORS.entries()) {
    await prisma.indicator.upsert({ where: { code }, create: { code, name, group, unit, hasParticipants, sortOrder: i }, update: {} });
  }
  if (!(await prisma.rosterPolicy.count())) {
    for (const [name, category, maritalStatus, onsiteDays, offDays, countWorkdays, isActive] of POLICIES) {
      await prisma.rosterPolicy.create({ data: { name, category, maritalStatus, onsiteDays, offDays, countWorkdays, isActive, notes: 'Acuan dari requirement; perlu persetujuan PJM.' } });
    }
  }
  for (const [code, name, category, validityMonths] of COMPETENCIES) {
    await prisma.competency.upsert({ where: { code }, create: { code, name, category, validityMonths }, update: {} });
  }
  if (!(await prisma.efficiencyScenario.count())) {
    await prisma.efficiencyScenario.create({ data: { ...DISCUSSED_SCENARIO, createdBy: 'seed' } });
  }
  const admin = await prisma.user.findFirst({ where: { role: 'HO_HSE' } });
  if (admin) {
    console.log('Data referensi siap. Akun HO HSE sudah ada; tidak ada akun dibuat.');
  } else {
    const email = process.env.SEED_ADMIN_EMAIL || 'hse.ho@prohaba.co.id';
    const password = randomBytes(18).toString('base64url');
    await prisma.user.create({ data: { name: 'Admin HO HSE', email, password: await bcrypt.hash(password, 12), role: 'HO_HSE' } });
    const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') ?? 'public';
    const file = schema === 'public' ? '.env.admin.production.local' : '.env.admin.local';
    writeFileSync(file, 'ADMIN_EMAIL=' + JSON.stringify(email) + '\nADMIN_PASSWORD=' + JSON.stringify(password) + '\n');
    console.log('Data referensi siap. Akun HO HSE dibuat; kredensial disimpan lokal di ' + file + '.');
  }
} finally {
  await prisma.$disconnect();
}
