// Data DEMO untuk development/UAT internal saja. Menolak berjalan di produksi atau bila data personel sudah ada.
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { encrypt, lookupHash } from '../src/lib/crypto.js';
import { addDays, addMonths, today } from '../src/lib/dates.js';
import { calcManhours } from '../src/lib/domain/performance.js';

if (process.env.VERCEL || process.env.NODE_ENV === 'production' || new URL(process.env.DATABASE_URL).searchParams.get('schema') !== 'hse_dev') {
  throw new Error('Seed demo hanya untuk schema hse_dev.');
}

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const FIRST = ['Andi', 'Budi', 'Citra', 'Dedi', 'Eko', 'Fajar', 'Gilang', 'Hendra', 'Indra', 'Joko', 'Kurnia', 'Lukman', 'Made', 'Nanda', 'Oki', 'Putra', 'Rizal', 'Sandi', 'Taufik', 'Udin', 'Wahyu', 'Yusuf', 'Zainal', 'Agus', 'Bayu', 'Dimas', 'Ferry', 'Hadi', 'Irfan', 'Rudi'];
const LAST = ['Saputra', 'Pratama', 'Wijaya', 'Hidayat', 'Siregar', 'Nasution', 'Harahap', 'Simanjuntak', 'Gunawan', 'Setiawan', 'Kurniawan', 'Ramadhan', 'Lubis', 'Hasibuan'];
const POS = { STAFF: ['Supervisor Produksi', 'Admin Site', 'Safety Officer', 'Engineer'], MANPOWER: ['Operator Excavator', 'Driver Dump Truck', 'Helper', 'Mekanik', 'Mandor'], HARIAN_KANTOR: ['Office Boy', 'Staf Gudang'] };

try {
  if (await prisma.personnel.count()) {
    console.log('Data personel sudah ada; seed demo dilewati.');
    process.exit(0);
  }
  const sites = Object.fromEntries((await prisma.site.findMany()).map((s) => [s.code, s]));
  if (!sites.TBG) throw new Error('Jalankan npm run seed terlebih dahulu.');
  const now = today();
  const creds = [];
  const mkUser = async (name, email, role, siteCodes = [], extra = {}) => {
    const password = randomBytes(9).toString('base64url');
    const u = await prisma.user.create({ data: { name, email, role, password: await bcrypt.hash(password, 10), ...extra, sites: { create: siteCodes.map((c) => ({ siteId: sites[c].id })) } } });
    creds.push([role, email, password]);
    return u;
  };
  const hse = await mkUser('Rina HSE Tabang', 'hse.tabang@demo.prohaba.co.id', 'HSE_SITE', ['TBG']);
  await mkUser('Arif PJO Tabang', 'pjo.tabang@demo.prohaba.co.id', 'PJO', ['TBG']);
  await mkUser('Bambang PM Timur', 'pm.timur@demo.prohaba.co.id', 'PM', [], { region: 'TIMUR' });
  await mkUser('Sari HRD', 'hrd@demo.prohaba.co.id', 'HRD');
  await mkUser('Direksi PJM', 'direksi@demo.prohaba.co.id', 'DIREKSI');
  const shared = await mkUser('Akun HSE Lahat (bersama)', 'hse.lahat@demo.prohaba.co.id', 'HSE_SITE', ['LHT'], { isShared: true });
  for (const name of ['Doni', 'Maya']) {
    const pin = String(Math.floor(100000 + rnd() * 899999));
    await prisma.operator.create({ data: { userId: shared.id, name, pinHash: await bcrypt.hash(pin, 10) } });
    creds.push(['OPERATOR ' + name + ' @ hse.lahat', 'PIN', pin]);
  }
  await prisma.siteResponsible.createMany({ data: [
    { siteId: sites.TBG.id, role: 'PJO', name: 'Arif PJO Tabang', startDate: addDays(now, -400) },
    { siteId: sites.TBG.id, role: 'PM', name: 'Bambang PM Timur', startDate: addDays(now, -400) },
    { siteId: sites.TBG.id, role: 'HSE_SITE', name: 'Rina HSE Tabang', startDate: addDays(now, -400) },
  ] });
  await prisma.project.createMany({ data: [
    { siteId: sites.TBG.id, name: 'Overburden Removal Tabang', owner: 'PT Owner Tambang A', startDate: addDays(now, -500), status: 'ACTIVE' },
    { siteId: sites.LHT.id, name: 'Hauling Batubara Lahat', owner: 'PT Owner Tambang B', startDate: addDays(now, -300), status: 'ACTIVE' },
  ] });

  const plan = [['TBG', 24], ['LHT', 12], ['KTM', 6], ['HO', 3]];
  let n = 0;
  const people = [];
  for (const [code, count] of plan) {
    for (let i = 0; i < count; i++) {
      n++;
      const category = code === 'HO' ? 'STAFF' : i % 6 === 0 ? 'STAFF' : i % 11 === 5 ? 'HARIAN_KANTOR' : 'MANPOWER';
      const nik = '64' + String(10000000000000 + n * 7919).slice(-14);
      const start = addDays(now, -Math.floor(40 + rnd() * 200));
      const p = await prisma.personnel.create({
        data: {
          code: 'PJM-' + String(n).padStart(6, '0'), nikHash: lookupHash(nik), nikEnc: encrypt(nik), nikLast4: nik.slice(-4),
          name: `${pick(FIRST)} ${pick(LAST)}`, birthPlace: pick(['Samarinda', 'Balikpapan', 'Palembang', 'Banda Aceh', 'Banjarmasin']),
          birthDate: addDays(now, -Math.floor(8000 + rnd() * 8000)), gender: 'L', maritalStatus: rnd() > 0.4 ? 'MENIKAH' : 'BELUM_MENIKAH',
          education: pick(['SMA', 'SMK', 'D3', 'S1']), phoneWa: '08' + String(1100000000 + n * 7331).slice(0, 10), ktpAddressEnc: encrypt('Jl. Contoh No. ' + n),
          category, position: pick(POS[category]), initialSiteId: sites[code].id, currentSiteId: sites[code].id, startDate: start,
          bankName: category === 'STAFF' ? 'BRI' : null, bankAccountEnc: category === 'STAFF' ? encrypt('0001' + String(n).padStart(8, '0')) : null,
        },
      });
      await prisma.placement.create({ data: { personnelId: p.id, siteId: sites[code].id, position: p.position, startDate: start, createdBy: hse.id } });
      people.push({ ...p, siteCode: code });
    }
  }

  // MCU & permit dengan variasi status untuk menguji pengingat.
  for (const [i, p] of people.entries()) {
    if (p.siteCode === 'HO' || i % 13 === 12) continue;
    const roll = i % 10;
    const mcuDate = roll < 2 ? addDays(now, -350) : addDays(now, -Math.floor(30 + rnd() * 200));
    const result = roll === 3 ? 'FOLLOW_UP' : roll === 7 && i % 3 === 0 ? 'UNFIT' : 'FIT';
    const mcu = await prisma.mcuRecord.create({
      data: {
        personnelId: p.id, siteId: p.currentSiteId, type: 'PRE_EMPLOYMENT', clinic: 'Klinik Mitra Sehat', stage: 'SELESAI', screeningDate: addDays(mcuDate, -1), mcuDate,
        resultDate: addDays(mcuDate, 3), submitDate: addDays(mcuDate, 3), feedbackDate: addDays(mcuDate, 7), result,
        validUntil: result === 'FIT' ? addMonths(mcuDate, 12) : null, fuDueDate: result === 'FOLLOW_UP' ? addDays(now, 5) : null, cost: 450000, createdBy: hse.id,
      },
    });
    if (result !== 'UNFIT') {
      const startP = addDays(mcuDate, 10);
      const endP = result === 'FIT' ? addDays(addMonths(startP, 12), -1) : addDays(now, 12);
      await prisma.permit.create({
        data: { personnelId: p.id, siteId: p.currentSiteId, kind: 'PERMIT', permitType: 'ID Card / Mine Permit', number: `MP-${p.siteCode}-${1000 + i}`, issuer: 'Owner', startDate: startP, endDate: i === 5 ? addDays(now, -3) : endP, basisResult: result, mcuId: mcu.id, isTemporary: result === 'FOLLOW_UP', createdBy: hse.id },
      });
    }
  }

  // Performance harian 45 hari terakhir untuk TBG & LHT.
  for (const code of ['TBG', 'LHT']) {
    for (let d = 45; d >= 1; d--) {
      const date = addDays(now, -d);
      const manpower = code === 'TBG' ? 22 + Math.floor(rnd() * 3) : 11;
      const v = { manpower, workHours: 10, overtimeHours: Math.floor(rnd() * 20), excludedHours: 0 };
      await prisma.dailyPerformance.create({ data: { ...v, manhours: calcManhours(v), siteId: sites[code].id, date, reportedBy: hse.id, reporterName: 'Seed demo' } });
      await prisma.hseActivity.create({ data: { siteId: sites[code].id, date, indicatorCode: 'TBM', count: 1, participants: manpower, title: 'Toolbox pagi', reportedBy: hse.id, reporterName: 'Seed demo' } });
      if (d % 7 === 0) await prisma.hseActivity.create({ data: { siteId: sites[code].id, date, indicatorCode: 'PATROL', count: 1, title: 'Patroli area pit', reportedBy: hse.id, reporterName: 'Seed demo' } });
      if (d % 9 === 0) await prisma.hseActivity.create({ data: { siteId: sites[code].id, date, indicatorCode: 'UNSAFE_CONDITION', count: 2, title: 'Rambu jalan hauling rusak', reportedBy: hse.id, reporterName: 'Seed demo' } });
    }
  }
  await prisma.incident.create({ data: { number: `INC-${now.getUTCFullYear()}-0001`, siteId: sites.TBG.id, occurredAt: addDays(now, -12), location: 'Jalan hauling KM 7', category: 'NEAR_MISS', title: 'Dump truck hampir bersenggolan di tikungan', chronology: 'Dua unit berpapasan di tikungan tanpa rambu.', createdBy: hse.id, creatorName: 'Seed demo', status: 'TINDAK_LANJUT', actions: { create: [{ type: 'KOREKTIF', description: 'Pasang rambu & cermin cembung', pic: 'Arif PJO Tabang', dueDate: addDays(now, 5) }] } } });
  await prisma.incident.create({ data: { number: `INC-${now.getUTCFullYear()}-0002`, siteId: sites.LHT.id, occurredAt: addDays(now, -20), location: 'Workshop', category: 'FAC', title: 'Luka gores tangan saat ganti filter', chronology: 'Tangan tergores bibir housing filter.', createdBy: shared.id, creatorName: 'Seed demo', status: 'CLOSED', rootCause: 'Tidak memakai sarung tangan', closedAt: addDays(now, -15), closedBy: 'Seed demo' } });
  await prisma.sequence.createMany({ data: [{ key: 'incident-' + now.getUTCFullYear(), value: 2 }, { key: 'personnel', value: n }], skipDuplicates: true });

  // Satu personel sedang cuti, satu pengajuan mutasi menunggu HO, data gaji staff & rekomendasi.
  const onLeave = people.find((p) => p.siteCode === 'TBG' && p.category === 'MANPOWER');
  await prisma.leaveRecord.create({ data: { personnelId: onLeave.id, siteId: onLeave.currentSiteId, type: 'CUTI', startDate: addDays(now, -3), endDate: addDays(now, 10), status: 'BERJALAN', createdBy: hse.id } });
  await prisma.personnel.update({ where: { id: onLeave.id }, data: { workStatus: 'CUTI' } });
  const mover = people.filter((p) => p.siteCode === 'TBG')[3];
  await prisma.mutation.create({ data: { number: `MUT-${now.getUTCFullYear()}-0001`, personnelId: mover.id, fromSiteId: sites.TBG.id, toSiteId: sites.KTM.id, toPosition: mover.position, effectiveDate: addDays(now, 7), reason: 'Kebutuhan operator di Kotim', requestedBy: hse.id, requestedName: 'Rina HSE Tabang' } });
  await prisma.sequence.create({ data: { key: 'mutation-' + now.getUTCFullYear(), value: 1 } });
  for (const [i, p] of people.entries()) {
    const base = p.category === 'STAFF' ? 8000000 + i * 50000 : 4500000 + i * 20000;
    await prisma.salary.create({ data: { personnelId: p.id, baseEnc: encrypt(base), allowanceEnc: encrypt(Math.round(base * 0.25)), effectiveFrom: addDays(now, -200), createdBy: 'seed' } });
    if (i % 9 === 4) await prisma.hrRecommendation.create({ data: { personnelId: p.id, color: 'KUNING', action: 'DIRUMAHKAN', reason: 'Demo: penurunan volume proyek', createdBy: 'seed', creatorName: 'Seed demo' } });
  }
  writeFileSync('.env.demo-users.local', creds.map(([r, e, p]) => `# ${r}\n${e} = ${p}`).join('\n') + '\n');
  console.log(`Demo: ${people.length} personel, ${creds.length} akun/operator. Kredensial di .env.demo-users.local`);
} finally {
  await prisma.$disconnect();
}
