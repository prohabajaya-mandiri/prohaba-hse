import test from 'node:test';
import assert from 'node:assert/strict';
import { iso, toDate } from '../src/lib/dates.js';
import { canAccess, csmsActions, csmsTransition } from '../src/lib/access.js';
import { completeness, derivedFlags, dueDateOf, maxScoreCheck, periodOf, requiredPeriods, rollupStatus } from '../src/lib/domain/csms.js';
import template from '../src/lib/csms-templates/amm-vib1-008a.js';

const D = (s) => toDate(s);

test('template AMM-VIB1-008A: 15 unsur, 57 butir, total 114 = sumber; ID internal unik, kode asli dipertahankan', () => {
  const items = template.elements.flatMap((e) => e.items);
  assert.equal(template.elements.length, 15);
  assert.deepEqual(maxScoreCheck(items, template.sourceMaxScore), { items: 57, total: 114, sourceMax: 114, diff: 0 });
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.equal(items.filter((i) => i.sourceCode === '5.1').length, 3, 'kode 5.1 berulang di sumber tetap dikutip apa adanya');
  assert.ok(items.some((i) => i.text.includes('Ke+C58rja')), 'teks sumber tidak diubah');
  assert.ok(items.every((i) => !i.displayText || !i.displayText.includes('+C58')));
});

test('selisih nilai maksimum dilaporkan, bukan disembunyikan', () => {
  assert.equal(maxScoreCheck([{ maxScore: 2 }, { maxScore: 2 }], 6).diff, -2);
  assert.equal(maxScoreCheck([{ maxScore: 2 }], null).diff, null);
});

test('periode berkala terpisah: bukti bulan lalu tidak memenuhi bulan berikutnya', () => {
  const req = { frequency: 'MONTHLY', dueDays: 10 };
  const oct = requiredPeriods(req, D('2026-10-01'), D('2026-10-31'), { startDate: D('2026-01-01') });
  assert.deepEqual(oct.map((p) => p.periodKey), ['2026-10']);
  assert.equal(iso(oct[0].dueDate), '2026-11-10');
  const nov = requiredPeriods(req, D('2026-11-01'), D('2026-11-30'), { startDate: D('2026-01-01') });
  assert.deepEqual(nov.map((p) => p.periodKey), ['2026-11']);
});

test('frekuensi: mingguan, harian, tahunan, sekali, jadwal khusus, kejadian', () => {
  const from = D('2026-10-01'), to = D('2026-10-31'), ctx = { startDate: D('2026-01-01') };
  assert.deepEqual(requiredPeriods({ frequency: 'WEEKLY' }, from, to, ctx).map((p) => p.periodKey), ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44']);
  assert.equal(requiredPeriods({ frequency: 'DAILY' }, from, to, ctx).length, 31);
  assert.deepEqual(requiredPeriods({ frequency: 'YEARLY' }, from, to, ctx).map((p) => p.periodKey), ['2026']);
  assert.deepEqual(requiredPeriods({ frequency: 'ONCE', dueDate: D('2026-02-01') }, from, to, ctx).map((p) => [p.periodKey, iso(p.dueDate)]), [['AWAL', '2026-02-01']]);
  assert.deepEqual(requiredPeriods({ frequency: 'CUSTOM', schedule: ['2026-10-15', '2026-12-15'] }, from, to, ctx).map((p) => p.periodKey), ['2026-10-15']);
  assert.deepEqual(requiredPeriods({ frequency: 'EVENT' }, from, to, ctx), []);
  // Penerapan dimulai di tengah bulan: hari sebelum mulai tidak diwajibkan.
  assert.equal(requiredPeriods({ frequency: 'DAILY' }, from, to, { startDate: D('2026-10-20') }).length, 12);
  assert.deepEqual(requiredPeriods({ frequency: 'MONTHLY' }, from, to, { startDate: D('2026-11-05') }), []);
});

test('kunci periode divalidasi sesuai frekuensi', () => {
  assert.equal(periodOf('MONTHLY', '2026-13'), null);
  assert.equal(periodOf('WEEKLY', '2026-W60'), null);
  assert.equal(periodOf('DAILY', '2026-02-30'), null);
  assert.equal(periodOf('ONCE', '2026-10'), null);
  assert.equal(periodOf('ON_CHANGE', '2026-10-05').periodKey, '2026-10-05');
  assert.equal(periodOf('CUSTOM', '2026-11-01', { schedule: ['2026-10-01'] }), null);
  assert.equal(iso(periodOf('CUSTOM', '2026-12-15', { schedule: ['2026-10-15', '2026-12-15'] }).start), '2026-10-16');
  assert.equal(dueDateOf({ frequency: 'MONTHLY', dueDays: null }, periodOf('MONTHLY', '2026-10')), null, 'tenggat tidak dikarang bila belum ditetapkan');
});

test('kedaluwarsa & keterlambatan dihitung terpisah dari status alur', () => {
  const now = D('2026-10-29');
  assert.deepEqual(derivedFlags({ status: 'DRAFT', dueDate: D('2026-10-28') }, now), ['OVERDUE']);
  assert.deepEqual(derivedFlags({ status: 'BELUM', dueDate: D('2026-10-29') }, now), [], 'jatuh tempo hari ini belum terlambat');
  assert.deepEqual(derivedFlags({ status: 'SUBMITTED', dueDate: D('2026-10-01') }, now), [], 'sudah diajukan tepat waktu tidak dihitung terlambat');
  assert.deepEqual(derivedFlags({ status: 'VERIFIED', dueDate: D('2026-10-01'), validUntil: D('2026-10-20') }, now), ['EVIDENCE_EXPIRED']);
  assert.deepEqual(derivedFlags({ status: 'VERIFIED', validUntil: D('2026-11-15') }, now, 30), ['EVIDENCE_EXPIRING']);
  assert.deepEqual(derivedFlags({ status: 'VERIFIED', validUntil: D('2027-01-15') }, now, 30), []);
});

test('kelengkapan terverifikasi: tanpa butir berlaku = null (bukan 100%), N/A tidak dihitung', () => {
  assert.deepEqual(completeness([]), { applicable: 0, verified: 0, percent: null });
  assert.deepEqual(completeness([{ applicability: 'NA', status: 'NA' }]).percent, null);
  const r = completeness([
    { applicability: 'APPLICABLE', status: 'VERIFIED' },
    { applicability: 'APPLICABLE', status: 'SUBMITTED' },
    { applicability: 'APPLICABLE', status: 'BELUM' },
    { applicability: 'NA', status: 'NA' },
  ]);
  assert.deepEqual(r, { applicable: 3, verified: 1, percent: 33.3 });
  assert.equal(rollupStatus(['VERIFIED', 'REVISION', 'DRAFT']), 'REVISION');
  assert.equal(rollupStatus(['VERIFIED', 'VERIFIED']), 'VERIFIED');
  assert.equal(rollupStatus([]), null);
});

test('alur CSMS: Site ajukan → (PJO/PM) → HO verifikasi; kembalikan wajib catatan', () => {
  assert.equal(csmsTransition('HSE_SITE', 'SUBMIT', 'DRAFT').to, 'SUBMITTED');
  assert.equal(csmsTransition('HSE_SITE', 'SAVE', 'BELUM').to, 'DRAFT');
  assert.equal(csmsTransition('HSE_SITE', 'VERIFY', 'SUBMITTED'), null, 'Site tidak memverifikasi');
  assert.equal(csmsTransition('PJO', 'SUBMIT', 'DRAFT'), null);
  // Tanpa tahap PJO/PM: HO langsung verifikasi; PJO tidak punya aksi.
  assert.equal(csmsTransition('HO_HSE', 'VERIFY', 'SUBMITTED', false).to, 'VERIFIED');
  assert.equal(csmsTransition('PJO', 'REVIEW', 'SUBMITTED', false), null);
  // Dengan tahap PJO/PM: HO tidak boleh melompati pemeriksaan.
  assert.equal(csmsTransition('HO_HSE', 'VERIFY', 'SUBMITTED', true), null);
  assert.equal(csmsTransition('PM', 'REVIEW', 'SUBMITTED', true).to, 'REVIEWED');
  assert.equal(csmsTransition('PJO', 'RETURN', 'SUBMITTED', true).noteRequired, true);
  assert.equal(csmsTransition('HO_HSE', 'VERIFY', 'REVIEWED', true).to, 'VERIFIED');
  assert.equal(csmsTransition('PJO', 'RETURN', 'REVIEWED', true), null);
  // Revisi: ajukan versi baru dari REVISION; bukti terverifikasi yang diubah kembali ke Draft.
  assert.equal(csmsTransition('HSE_SITE', 'SUBMIT', 'REVISION').to, 'SUBMITTED');
  assert.equal(csmsTransition('HSE_SITE', 'REVISE', 'VERIFIED').to, 'DRAFT');
  assert.equal(csmsTransition('HSE_SITE', 'SAVE', 'VERIFIED'), null);
  assert.equal(csmsTransition('HO_HSE', 'REOPEN', 'VERIFIED').noteRequired, true);
  assert.equal(csmsTransition('HO_HSE', '__proto__', 'DRAFT'), null);
  assert.deepEqual(csmsActions('DIREKSI', 'SUBMITTED', false), []);
});

test('akses modul CSMS: HRD & Direksi hanya baca; PJO/PM menulis untuk pemeriksaan', () => {
  assert.equal(canAccess('HRD', '/csms'), true);
  assert.equal(canAccess('HRD', '/api/csms/requirements/x/fulfillment', 'POST'), false);
  assert.equal(canAccess('DIREKSI', '/api/csms/applications', 'POST'), false);
  assert.equal(canAccess('PJO', '/api/csms/requirements/x/fulfillment', 'POST'), true);
  assert.equal(canAccess('HSE_SITE', '/api/csms/templates', 'POST'), true, 'diizinkan modul; ditolak service (hanya HO)');
});

test('temuan: unggah bukti tidak menutup; penutupan & buka kembali hanya HO dengan alasan', async () => {
  const { findingActions, findingTransition } = await import('../src/lib/access.js');
  assert.equal(findingTransition('HSE_SITE', 'START', 'TERBUKA').to, 'DALAM_PROSES');
  assert.equal(findingTransition('HSE_SITE', 'SUBMIT_CLOSE', 'DALAM_PROSES').to, 'DIAJUKAN_TUTUP');
  assert.equal(findingTransition('HSE_SITE', 'CLOSE', 'DIAJUKAN_TUTUP'), null, 'Site tidak menutup temuan');
  assert.equal(findingTransition('HO_HSE', 'CLOSE', 'DALAM_PROSES'), null, 'harus diajukan dulu');
  assert.equal(findingTransition('HO_HSE', 'CLOSE', 'DIAJUKAN_TUTUP').to, 'DITUTUP');
  assert.equal(findingTransition('HO_HSE', 'RETURN', 'DIAJUKAN_TUTUP').noteRequired, true);
  assert.equal(findingTransition('HO_HSE', 'REOPEN', 'DITUTUP').noteRequired, true);
  assert.equal(findingTransition('PJO', 'START', 'TERBUKA'), null);
  assert.deepEqual(findingActions('DIREKSI', 'TERBUKA'), []);
});

test('zona waktu site: hari ini dihitung per site (WIB/WITA/WIT)', async () => {
  const { todayIn, tzLabel } = await import('../src/lib/dates.js');
  const t = new Date('2026-10-29T16:30:00Z'); // 23:30 WIB, 00:30 WITA esok hari, 01:30 WIT
  assert.equal(iso(todayIn('Asia/Jakarta', t)), '2026-10-29');
  assert.equal(iso(todayIn('Asia/Makassar', t)), '2026-10-30');
  assert.equal(iso(todayIn('Asia/Jayapura', t)), '2026-10-30');
  assert.equal(iso(todayIn('Zona/Asal', t)), '2026-10-29', 'zona tidak dikenal jatuh ke zona aplikasi');
  assert.equal(tzLabel('Asia/Makassar'), 'WITA');
});

test('saran bukti dari modul hanya untuk butir yang isinya sesuai; MCU tanpa data medis', async () => {
  const { suggestedSources, SOURCE_TYPES } = await import('../src/lib/domain/csms.js');
  assert.deepEqual(suggestedSources('AMM-VIB1-F-SHE-008A', 'U12.02'), [{ type: 'MCU' }]);
  assert.deepEqual(suggestedSources('AMM-VIB1-F-SHE-008A', 'U06.03').map((s) => s.indicator), ['INSPECTION', 'PATROL']);
  assert.deepEqual(suggestedSources('AMM-VIB1-F-SHE-008A', 'U01.01'), [], 'kebijakan = dokumen, bukan data modul');
  assert.deepEqual(suggestedSources('OWNER-LAIN', 'U12.02'), []);
  const counted = template.elements.flatMap((e) => e.items).filter((i) => suggestedSources(template.sourceDocCode ?? 'AMM-VIB1-F-SHE-008A', i.id).length);
  assert.equal(counted.length, 15, '15 butir 008A punya saran sumber modul');
  assert.equal(SOURCE_TYPES.MCU.module, '/mcu');
});
