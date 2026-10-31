import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess } from '../src/lib/access.js';
import { capaActions, capaTransition, itemsToText, parseItemsText, riskLevel, summarizeAnswers } from '../src/lib/domain/field-safety.js';

test('matriks risiko mengikuti matriks owner (AMM) pada formulir JSA', () => {
  // riskLevel(kemungkinan, keparahan) — contoh langsung dari baris JSA yang dikirim.
  assert.equal(riskLevel(2, 2), 'SEDANG'); // 2×2 = M
  assert.equal(riskLevel(2, 3), 'SEDANG'); // 2×3 = M
  assert.equal(riskLevel(3, 3), 'TINGGI'); // 3×3 = H
  assert.equal(riskLevel(2, 4), 'TINGGI'); // 2×4 = H
  assert.equal(riskLevel(2, 5), 'EKSTREM'); // 2×5 = E (gerinda pecah)
  assert.equal(riskLevel(1, 1), 'RENDAH');
  assert.equal(riskLevel(5, 1), 'SEDANG');
  assert.equal(riskLevel(3, 4), 'EKSTREM');
  assert.equal(riskLevel(6, 1), null);
});

test('checklist: butir kritis Tidak OK = TIDAK LAYAK; non-kritis tetap layak', () => {
  const items = [{ text: 'Rem', critical: true }, { text: 'Spion', critical: false }, { text: 'Radio', critical: false }];
  const res = (a) => summarizeAnswers(items.map((it, i) => ({ ...it, result: a[i] })));
  assert.deepEqual({ ...res(['OK', 'OK', 'NA']), failed: undefined }, { okCount: 2, notOkCount: 0, result: 'LAYAK', failed: undefined });
  assert.equal(res(['OK', 'TIDAK_OK', 'OK']).result, 'LAYAK');
  assert.equal(res(['TIDAK_OK', 'OK', 'OK']).result, 'TIDAK_LAYAK');
  assert.equal(res(['TIDAK_OK', 'TIDAK_OK', 'OK']).failed.length, 2);
});

test('template checklist dari teks: "!" menandai butir kritis', () => {
  const items = parseItemsText('! Rem berfungsi\n\nSpion  \n!Sabuk pengaman');
  assert.deepEqual(items, [{ text: 'Rem berfungsi', critical: true }, { text: 'Spion', critical: false }, { text: 'Sabuk pengaman', critical: true }]);
  assert.deepEqual(parseItemsText(itemsToText(items)), items);
});

test('CAPA: risiko tinggi/ekstrem hanya ditutup HO HSE; PJO/PM boleh mengerjakan', () => {
  assert.ok(capaTransition('PJO', 'SUBMIT_CLOSE', 'DALAM_PROSES', 'SEDANG'));
  assert.ok(capaTransition('HSE_SITE', 'CLOSE', 'DIAJUKAN_TUTUP', 'SEDANG'));
  assert.equal(capaTransition('HSE_SITE', 'CLOSE', 'DIAJUKAN_TUTUP', 'TINGGI'), null);
  assert.ok(capaTransition('HO_HSE', 'CLOSE', 'DIAJUKAN_TUTUP', 'EKSTREM'));
  assert.equal(capaTransition('PJO', 'CLOSE', 'DIAJUKAN_TUTUP', 'RENDAH'), null);
  assert.equal(capaTransition('HSE_SITE', 'REOPEN', 'DITUTUP', 'RENDAH'), null);
  assert.ok(capaTransition('HO_HSE', 'RETURN', 'DIAJUKAN_TUTUP', 'TINGGI').noteRequired);
  assert.deepEqual(capaActions('DIREKSI', 'TERBUKA', 'SEDANG'), []);
});

test('akses modul lapangan: HRD tidak masuk, PJO/PM boleh melapor', () => {
  for (const p of ['/hazards', '/inspections', '/actions']) {
    assert.equal(canAccess('HRD', p), false, p);
    assert.equal(canAccess('PJO', '/api' + p, 'POST'), true, p);
    assert.equal(canAccess('DIREKSI', '/api' + p, 'POST'), false, p);
  }
});
