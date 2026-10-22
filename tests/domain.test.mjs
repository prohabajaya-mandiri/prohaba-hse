import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, iso, isoWeekKey, isoWeekRange, toDate } from '../src/lib/dates.js';
import { annualValidUntil, fitness, planMcu } from '../src/lib/domain/mcu.js';
import { permitStatus, permitWarnings, suggestedEnd } from '../src/lib/domain/permit.js';
import { addWorkdays, cycleStart, nextLeaveDue, pickPolicy, rosterState } from '../src/lib/domain/roster.js';
import { calcManhours, safeManhours, summarize } from '../src/lib/domain/performance.js';
import { previousMonthKey, reportPeriod, sitesNotReported } from '../src/lib/domain/reports.js';
import { DISCUSSED_SCENARIO, simulate, validateSteps } from '../src/lib/domain/hrd.js';
import { mapImportRow, normalizeDate, normalizeImportRow, parseKtpText, tenure } from '../src/lib/domain/personnel.js';
import { nip } from '../src/lib/validation.js';

const D = (s) => toDate(s);
const durations = { screening: 1, mcu: 1, waitResult: 3, feedbackMin: 3, feedbackMax: 5, followUp: 2, mobilization: 2 };

test('estimasi alur MCU mengikuti durasi requirement', () => {
  const normal = planMcu(D('2026-10-01'), durations);
  assert.equal(normal.totalDays, 12); // 1+1+3+submit+5+2
  assert.equal(iso(normal.readyDate), '2026-10-13');
  const fu = planMcu(D('2026-10-01'), durations, true);
  assert.equal(fu.totalDays, 14);
  assert.deepEqual(fu.plan.map((p) => p.stage), ['SCREENING', 'MCU', 'MENUNGGU_HASIL', 'SUBMIT', 'FEEDBACK', 'FOLLOW_UP', 'SUBMIT_FU', 'MOBILISASI']);
});

test('status kelayakan dari MCU terbaru', () => {
  const now = D('2026-10-16');
  assert.equal(fitness(null, now), 'BELUM_MCU');
  assert.equal(fitness({ result: 'FIT', validUntil: D('2027-01-01') }, now), 'FIT');
  assert.equal(fitness({ result: 'FIT', validUntil: D('2026-10-01') }, now), 'MCU_KEDALUWARSA');
  assert.equal(fitness({ result: 'FOLLOW_UP', fuDueDate: D('2026-10-10') }, now), 'FU_TERLAMBAT');
  assert.equal(fitness({ result: 'UNFIT' }, now), 'UNFIT');
  assert.equal(iso(annualValidUntil(D('2026-02-28'), 12)), '2027-02-28');
});

test('permit: acuan FIT 1 tahun, FU 3 bulan, status masa berlaku', () => {
  assert.equal(iso(suggestedEnd(D('2026-01-01'), 'FIT')), '2026-12-31');
  assert.equal(iso(suggestedEnd(D('2026-01-01'), 'FOLLOW_UP')), '2026-03-31');
  assert.equal(suggestedEnd(D('2026-01-01'), 'UNFIT'), null);
  const now = D('2026-10-16');
  assert.equal(permitStatus({ startDate: D('2026-01-01'), endDate: D('2026-12-31') }, now, 30), 'AKTIF');
  assert.equal(permitStatus({ startDate: D('2026-01-01'), endDate: D('2026-11-01') }, now, 30), 'AKAN_HABIS');
  assert.equal(permitStatus({ startDate: D('2026-01-01'), endDate: D('2026-10-15') }, now, 30), 'KEDALUWARSA');
  assert.equal(permitStatus({ startDate: D('2026-01-01'), endDate: D('2026-12-31'), revokedAt: new Date() }, now, 30), 'DICABUT');
  assert.ok(permitWarnings({ basisResult: 'UNFIT', startDate: D('2026-01-01'), endDate: D('2026-02-01') }).some((w) => w.includes('UNFIT')));
  assert.ok(permitWarnings({ basisResult: 'FOLLOW_UP', isTemporary: false, startDate: D('2026-01-01'), endDate: D('2026-12-01') }).length >= 2);
  assert.deepEqual(permitWarnings({ basisResult: 'FIT', startDate: D('2026-01-01'), endDate: D('2026-12-31') }), []);
});

test('roster: pola paling spesifik, sakit tidak mereset siklus', () => {
  const policies = [
    { id: 'a', isActive: true, category: 'STAFF', maritalStatus: 'MENIKAH', onsiteDays: 90, offDays: 14 },
    { id: 'b', isActive: true, category: 'STAFF', maritalStatus: 'BELUM_MENIKAH', onsiteDays: 120, offDays: 14 },
    { id: 'c', isActive: true, category: 'MANPOWER', onsiteDays: 150, offDays: 14 },
    { id: 'd', isActive: true, category: 'MANPOWER', siteId: 'tbg', onsiteDays: 70, offDays: 14, countWorkdays: true },
  ];
  assert.equal(pickPolicy(policies, { category: 'STAFF', maritalStatus: 'MENIKAH' }).id, 'a');
  assert.equal(pickPolicy(policies, { category: 'STAFF', maritalStatus: null }).id, 'b');
  assert.equal(pickPolicy(policies, { category: 'MANPOWER', siteId: 'tbg' }).id, 'd');
  assert.equal(pickPolicy(policies, { category: 'MANPOWER', siteId: 'lht' }).id, 'c');
  const start = cycleStart(D('2026-01-01'), [
    { type: 'SAKIT', status: 'SELESAI', endDate: D('2026-03-01'), returnDate: D('2026-03-02') },
    { type: 'CUTI', status: 'SELESAI', endDate: D('2026-04-14'), returnDate: D('2026-04-15') },
  ]);
  assert.equal(iso(start), '2026-04-15');
  assert.equal(iso(nextLeaveDue(policies[0], start)), '2026-07-14');
  assert.equal(iso(addWorkdays(D('2026-10-17'), 6)), '2026-10-24'); // Minggu 18 Okt dilewati
  assert.equal(rosterState(D('2026-10-20'), D('2026-10-16'), 14).state, 'MENDEKATI_CUTI');
  assert.equal(rosterState(D('2026-10-10'), D('2026-10-16'), 14).state, 'LEWAT_JADWAL');
});

test('manhours & safe manhours dari data harian', () => {
  assert.equal(calcManhours({ manpower: 20, workHours: 10, overtimeHours: 15, excludedHours: 5 }), 210);
  const daily = [{ date: D('2026-10-01'), manhours: 100 }, { date: D('2026-10-02'), manhours: 100 }, { date: D('2026-10-03'), manhours: 100 }];
  assert.equal(safeManhours(daily, []), 300);
  assert.equal(safeManhours(daily, [{ occurredAt: D('2026-10-01'), category: 'LTI' }]), 200);
  assert.equal(safeManhours(daily, [{ occurredAt: D('2026-10-01'), category: 'NEAR_MISS' }]), 300);
});

test('rekap periode menjumlah aktivitas sekali tanpa input ulang', () => {
  const s = summarize({
    daily: [{ manpower: 10, manhours: 100 }, { manpower: 20, manhours: 200 }],
    activities: [{ indicatorCode: 'TBM', count: 1, participants: 10 }, { indicatorCode: 'TBM', count: 2, participants: 5 }],
    incidents: [{ category: 'LTI', lostDays: 3 }],
  });
  assert.equal(s.manhours, 300);
  assert.equal(s.avgManpower, 15);
  assert.deepEqual(s.activities.TBM, { count: 3, participants: 15, entries: 2 });
  assert.equal(s.incidents.LTI, 1);
  assert.equal(s.ltifr, Math.round((1_000_000 / 300) * 100) / 100);
});

test('periode laporan & batas bulanan tanggal 10', () => {
  const m = reportPeriod('BULANAN', '2026-09', 10);
  assert.equal(iso(m.start), '2026-09-01');
  assert.equal(iso(m.end), '2026-09-30');
  assert.equal(iso(m.dueDate), '2026-10-10');
  assert.equal(iso(reportPeriod('BULANAN', '2026-12', 10).dueDate), '2027-01-10');
  assert.equal(reportPeriod('BULANAN', '2026-13'), null);
  const w = reportPeriod('MINGGUAN', '2026-W42');
  assert.equal(iso(w.start), '2026-10-12');
  assert.equal(isoWeekKey(D('2026-10-16')), '2026-W42');
  assert.equal(iso(isoWeekRange('2026-W01').start), '2025-12-29');
  assert.equal(reportPeriod('HARIAN', '2026-02-30'), null);
  assert.equal(previousMonthKey(D('2026-01-05')), '2025-12');
  const sites = [{ id: 'a' }, { id: 'b' }, { id: 'ho', isHo: true }];
  assert.deepEqual(sitesNotReported(sites, [{ siteId: 'a', type: 'BULANAN', periodKey: '2026-09', status: 'SUBMITTED' }, { siteId: 'b', type: 'BULANAN', periodKey: '2026-09', status: 'DRAFT' }], '2026-09').map((s) => s.id), ['b']);
});

test('simulasi skenario efisiensi yang pernah dibahas', () => {
  const people = [
    { siteId: 's', siteName: 'S', group: 'LANJUT', base: 5_000_000, allowance: 1_000_000 },
    { siteId: 's', siteName: 'S', group: 'DIRUMAHKAN', base: 4_000_000, allowance: 1_000_000 },
  ];
  const r = simulate(people, DISCUSSED_SCENARIO.steps);
  const month = (m) => r.rows.find((x) => x.month === m);
  assert.equal(month('2026-10').saving, 0); // Okt seluruhnya digaji
  assert.equal(month('2026-11').scenario, 6_000_000 + 4_000_000); // gaji pokok
  assert.equal(month('2026-12').scenario, 6_000_000 + 2_000_000); // 50%
  assert.equal(month('2027-01').scenario, 6_000_000 + 1_200_000); // 30%
  assert.equal(validateSteps(DISCUSSED_SCENARIO.steps), null);
  assert.ok(validateSteps([{ month: '2026-10', rules: { DIRUMAHKAN: { basis: 'POKOK', percent: 150 } } }]));
});

test('OCR KTP diurai menjadi saran field', () => {
  const text = `PROVINSI KALIMANTAN TIMUR\nNIK : 64O2O11203900001\nNama : BUDI SANTOSO\nTempat/Tgl Lahir : SAMARINDA, 12-03-1990\nJenis Kelamin : LAKI-LAKI\nAlamat : JL. MERDEKA NO. 5\nRT/RW : 003/004\nKel/Desa : SUNGAI PINANG\nKecamatan : SAMARINDA UTARA\nStatus Perkawinan : KAWIN`;
  const r = parseKtpText(text);
  assert.equal(r.nik, '6402011203900001');
  assert.equal(r.name, 'BUDI SANTOSO');
  assert.equal(r.birthPlace, 'SAMARINDA');
  assert.equal(r.birthDate, '1990-03-12');
  assert.equal(r.gender, 'L');
  assert.equal(r.maritalStatus, 'MENIKAH');
  assert.ok(r.ktpAddress.includes('MERDEKA'));
});

test('header template import dipetakan ke field', () => {
  const row = mapImportRow({ 'NIK': '6402011203900001', 'Nama': 'Budi', 'Kategori (STAFF/MANPOWER/HARIAN_KANTOR)': 'MANPOWER', 'Kode Site': 'TBG', 'Tanggal Mulai (YYYY-MM-DD)': '2026-01-02', 'Kosong': '' });
  assert.deepEqual(row, { nik: '6402011203900001', name: 'Budi', category: 'MANPOWER', siteCode: 'TBG', startDate: '2026-01-02' });
  assert.equal(iso(addDays(D('2026-10-16'), 1)), '2026-10-17');
});

test('masa kerja dihitung dari tanggal mulai', () => {
  assert.equal(tenure('2020-01-15', '2026-10-19').label, '6 tahun 9 bulan');
  assert.equal(tenure('2026-10-01', '2026-10-19').label, '18 hari');
  assert.equal(tenure('2020-01-31', '2020-03-01').totalMonths, 1);
  assert.equal(tenure('2027-01-01', '2026-10-19'), null);
  assert.equal(tenure(null), null);
});

test('tanggal import menerima format umum Excel/Indonesia', () => {
  assert.equal(normalizeDate(33100), '1990-08-15');
  assert.equal(normalizeDate('15/08/1990'), '1990-08-15');
  assert.equal(normalizeDate('5-8-1990'), '1990-08-05');
  assert.equal(normalizeDate('5 Agustus 1990'), '1990-08-05');
  assert.equal(normalizeDate('1990-08-15T00:00:00.000Z'), '1990-08-15');
  assert.equal(normalizeDate('besok'), 'besok');
});

test('kolom opsional import: isian kosong/"-" diabaikan, nilai bebas dinormalisasi', () => {
  const row = mapImportRow({
    'NIK *': '6402011203900001', 'Nama Lengkap': 'Budi', 'Jenis Kelamin': 'Pria', 'Status Perkawinan': 'Belum Kawin',
    Kategori: 'Man Power', 'Tgl Masuk': 44562, 'Gol Darah': 'O+', 'No HP': 81234567890, NPWP: '09.254.294.3-407.000',
    'Status Kepegawaian': 'kontrak', 'BPJS Kesehatan': '-', 'Tanggal Lahir': 'N/A', Alamat: 'Jl. Merdeka',
  });
  const { body, errors } = normalizeImportRow(row);
  assert.deepEqual(errors, []);
  assert.deepEqual(body, {
    nik: '6402011203900001', name: 'Budi', gender: 'L', maritalStatus: 'BELUM_MENIKAH', phoneWa: '081234567890', ktpAddress: 'Jl. Merdeka',
    category: 'MANPOWER', startDate: '2022-01-01', employmentType: 'PKWT', npwp: '092542943407000', bloodType: 'O',
  });
  assert.equal(normalizeImportRow({ gender: 'Perempuan', maritalStatus: 'Kawin', employmentType: 'Tetap' }).body.gender, 'P');
  assert.equal(normalizeImportRow({ maritalStatus: 'Cerai Mati' }).body.maritalStatus, 'CERAI');
  assert.equal(normalizeImportRow({ employmentType: 'PKWTT' }).body.employmentType, 'PKWTT');
});

test('NIK 16 digit yang tersimpan sebagai angka Excel ditolak dengan petunjuk', () => {
  const { body, errors } = normalizeImportRow({ nik: 6402011203900000 });
  assert.equal(body.nik, undefined);
  assert.match(errors[0], /Format kolom NIK sebagai Text/);
});

test('rekening tidak pernah wajib pada import; nilai rusak hanya jadi peringatan', () => {
  const { body, errors, warnings } = normalizeImportRow({ category: 'STAFF', bankAccount: 1234567890123450 });
  assert.deepEqual(errors, []);
  assert.equal(body.bankAccount, undefined);
  assert.match(warnings[0], /rekening tidak diimpor/);
});

test('NIP bebas format: disimpan apa adanya, hanya spasi di awal/akhir dibuang', () => {
  assert.equal(nip('  ab_12 / x  '), 'ab_12 / x');
  assert.equal(nip('NIP#2024 (lama)'), 'NIP#2024 (lama)');
  assert.equal(nip(20230001), '20230001');
  assert.equal(nip('   '), null);
  assert.equal(nip(undefined), null);
  assert.throws(() => nip('x'.repeat(101)), /maksimal 100/);
});

test('kolom NIP dan NIP Mandor dikenali pada import Excel', () => {
  const { body } = normalizeImportRow(mapImportRow({ 'NIP': 20260401026, 'NIP Mandor': ' 2019120212 ' }));
  assert.equal(body.nip, '20260401026');
  assert.equal(body.foremanRef, '2019120212');
  assert.equal(mapImportRow({ 'Kode Mandor': 'PJM-000002' }).foremanRef, 'PJM-000002');
});
