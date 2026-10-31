import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess } from '../src/lib/access.js';
import { fitStatus, restStatus, summarizeChecks } from '../src/lib/domain/fit-to-work.js';

test('jam istirahat hari ini sesuai form P5M: ≥6 aman, 4–5 pengawasan, ≤3 tidak boleh', () => {
  assert.equal(restStatus(8), 'AMAN');
  assert.equal(restStatus(6), 'AMAN');
  assert.equal(restStatus(5), 'PENGAWASAN');
  assert.equal(restStatus(4), 'PENGAWASAN');
  assert.equal(restStatus(3), 'TIDAK_BOLEH');
  assert.equal(restStatus(0), 'TIDAK_BOLEH');
});

test('aturan 2 hari (hari ini + kemarin): ≥12 aman, 9–11 pengawasan, ≤8 tidak boleh; ambil yang terburuk', () => {
  assert.equal(restStatus(6, 6), 'AMAN');
  assert.equal(restStatus(6, 4), 'PENGAWASAN'); // 10 jam
  assert.equal(restStatus(6, 2), 'TIDAK_BOLEH'); // 8 jam, walau hari ini ≥ 6
  assert.equal(restStatus(5, 8), 'PENGAWASAN'); // total aman, hari ini 5 jam
  assert.equal(restStatus(6, ''), 'AMAN'); // kemarin tidak diisi
});

test('kondisi lain menaikkan status; GL "tidak boleh" selalu final', () => {
  assert.deepEqual(fitStatus({ restToday: 7 }), { status: 'AMAN', reasons: [] });
  assert.equal(fitStatus({ restToday: 7, medication: true }).status, 'PENGAWASAN');
  assert.equal(fitStatus({ restToday: 7, healthy: false }).status, 'PENGAWASAN');
  assert.equal(fitStatus({ restToday: 7, mentalReady: false }).status, 'PENGAWASAN');
  assert.equal(fitStatus({ restToday: 3, medication: true }).status, 'TIDAK_BOLEH');
  const gl = fitStatus({ restToday: 8, allowedByGl: false });
  assert.equal(gl.status, 'TIDAK_BOLEH');
  assert.deepEqual(gl.reasons, ['GL: tidak boleh kerja']);
  assert.deepEqual(fitStatus({ restToday: 5, restYesterday: 5, medication: true }).reasons, ['Istirahat 5 jam (2 hari 10 jam)', 'Minum obat']);
});

test('ringkasan sesi & akses modul', () => {
  assert.deepEqual(summarizeChecks([{ status: 'AMAN' }, { status: 'PENGAWASAN' }, { status: 'TIDAK_BOLEH' }, { status: 'AMAN' }]), { total: 4, okCount: 2, watchCount: 1, stopCount: 1 });
  assert.equal(canAccess('PJO', '/api/fit-to-work', 'POST'), true);
  assert.equal(canAccess('HRD', '/fit-to-work'), false);
  assert.equal(canAccess('DIREKSI', '/api/fit-to-work', 'POST'), false);
});
