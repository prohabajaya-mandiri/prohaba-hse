import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { canAccess, canDecideMutation, canSeeSensitive, isSameOriginMutation, reportTransition, ROLES, siteFilter, siteScope } from '../src/lib/access.js';

process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
const { decrypt, encrypt, lookupHash } = await import('../src/lib/crypto.js');
const { redact } = await import('../src/lib/audit.js');

const hseTabang = { role: 'HSE_SITE', siteIds: ['tbg'] };
const pjo = { role: 'PJO', siteIds: ['tbg'] };
const ho = { role: 'HO_HSE', siteIds: [] };

test('HSE Site hanya melihat site sendiri; HO lintas site', () => {
  assert.deepEqual(siteScope(hseTabang), ['tbg']);
  assert.equal(siteScope(ho), null);
  assert.deepEqual(siteFilter(hseTabang, 'lht'), { siteId: '__none__' });
  assert.deepEqual(siteFilter(hseTabang, null), { siteId: { in: ['tbg'] } });
  assert.deepEqual(siteFilter(ho, 'lht'), { siteId: 'lht' });
  assert.deepEqual(siteScope({ role: 'HSE_SITE' }), []);
});

test('data privat (KTP, MCU, rekening, gaji) dibatasi peran dan site', () => {
  assert.equal(canSeeSensitive(hseTabang, 'KTP', 'tbg'), true);
  assert.equal(canSeeSensitive(hseTabang, 'KTP', 'lht'), false);
  assert.equal(canSeeSensitive(hseTabang, 'MEDICAL', 'lht'), false);
  assert.equal(canSeeSensitive(pjo, 'MEDICAL', 'tbg'), false);
  assert.equal(canSeeSensitive(pjo, 'KTP', 'tbg'), false);
  assert.equal(canSeeSensitive(hseTabang, 'BANK', 'tbg'), false);
  assert.equal(canSeeSensitive({ role: 'HRD' }, 'BANK', 'lht'), true);
  const matrix = { view: ['HRD', 'DIREKSI'], edit: ['HRD'] };
  assert.equal(canSeeSensitive(ho, 'SALARY', null, matrix), false);
  assert.equal(canSeeSensitive({ role: 'DIREKSI' }, 'SALARY', null, matrix), true);
  assert.equal(canSeeSensitive(hseTabang, 'GENERAL', null), true);
  assert.equal(canSeeSensitive(hseTabang, 'GENERAL', 'lht'), false);
});

test('matriks modul: PJO/PM tidak mengedit data induk; hanya HO mengelola pengguna', () => {
  for (const role of ROLES) assert.equal(canAccess(role, '/api/users', 'POST'), role === 'HO_HSE');
  assert.equal(canAccess('PJO', '/api/personnel', 'POST'), false);
  assert.equal(canAccess('PM', '/api/mcu', 'POST'), false);
  assert.equal(canAccess('HSE_SITE', '/api/mcu', 'POST'), true);
  assert.equal(canAccess('HSE_SITE', '/hrd'), false);
  assert.equal(canAccess('HO_HSE', '/api/unknown', 'GET'), false);
  assert.equal(canAccess('GUEST', '/dashboard'), false);
  assert.equal(canDecideMutation(hseTabang), false);
  assert.equal(canDecideMutation(ho), true);
});

test('alur laporan: HSE Site kirim → PJO/PM periksa → HO sahkan', () => {
  assert.ok(reportTransition('HSE_SITE', 'SUBMIT', 'DRAFT'));
  assert.equal(reportTransition('PJO', 'SUBMIT', 'DRAFT'), null);
  assert.equal(reportTransition('HO_HSE', 'APPROVE', 'SUBMITTED'), null, 'HO tidak bisa melompati pemeriksaan PJO/PM');
  assert.ok(reportTransition('PM', 'REVIEW', 'SUBMITTED'));
  assert.ok(reportTransition('HO_HSE', 'APPROVE', 'REVIEWED'));
  assert.equal(reportTransition('PJO', 'APPROVE', 'REVIEWED'), null);
  assert.equal(reportTransition('HO_HSE', '__proto__', 'REVIEWED'), null);
  assert.equal(reportTransition('HO_HSE', 'RETURN_APPROVE', 'REVIEWED').to, 'REVISION');
});

test('dokumen HO terbatas & terpilih tidak terbuka ke semua site', async () => {
  process.env.DATABASE_URL ??= 'postgresql://ci:ci@localhost:5432/ci';
  const { canReadDocument } = await import('../src/lib/services/documents.js');
  const hoDoc = { siteId: null, accessScope: 'DEFAULT' };
  assert.equal(canReadDocument(hseTabang, hoDoc), true, 'perilaku lama dokumen HO tetap');
  assert.equal(canReadDocument(hseTabang, { siteId: null, accessScope: 'HO_ONLY' }), false);
  assert.equal(canReadDocument({ role: 'HRD' }, { siteId: null, accessScope: 'HO_ONLY' }), false);
  assert.equal(canReadDocument(ho, { siteId: null, accessScope: 'HO_ONLY' }), true);
  assert.equal(canReadDocument(hseTabang, { siteId: null, accessScope: 'LISTED' }, ['lht']), false);
  assert.equal(canReadDocument(hseTabang, { siteId: null, accessScope: 'LISTED' }, ['tbg']), true);
  assert.equal(canReadDocument(hseTabang, { siteId: 'lht', accessScope: 'DEFAULT' }), false);
});

test('mutasi lintas origin ditolak', () => {
  const req = (origin) => new Request('https://hse.example/api/personnel', { method: 'POST', headers: { origin } });
  assert.equal(isSameOriginMutation(req('https://attacker.example')), false);
  assert.equal(isSameOriginMutation(req('https://hse.example')), true);
});

test('enkripsi field & hash NIK', () => {
  const sealed = encrypt('6401234567890001');
  assert.notEqual(sealed, '6401234567890001');
  assert.equal(decrypt(sealed), '6401234567890001');
  assert.notEqual(encrypt('x'), encrypt('x'), 'IV acak');
  assert.equal(lookupHash('6401234567890001'), lookupHash('6401234567890001'));
  assert.equal(encrypt(''), null);
});

test('audit log tidak memuat nilai terenkripsi/hash', () => {
  const r = redact({ name: 'A', nikEnc: 'v1:abc', nikHash: 'ff', pinHash: 'x', nested: { bankAccountEnc: 'v1:z' } });
  assert.deepEqual(r, { name: 'A', nikEnc: '[dilindungi]', nikHash: '[dilindungi]', pinHash: '[dilindungi]', nested: { bankAccountEnc: '[dilindungi]' } });
});

test('setiap API bisnis melewati pemeriksaan otorisasi', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir + '/' + e.name) : [dir + '/' + e.name]));
  for (const file of walk('src/app/api').filter((f) => f.endsWith('/route.js') && !f.includes('/auth/'))) {
    const source = readFileSync(file, 'utf8');
    if (file.includes('/cron/')) {
      assert.ok(source.includes('CRON_SECRET') && source.includes('timingSafeEqual'), file);
      continue;
    }
    if (file.includes('/api/public/')) {
      // Route publik tanpa sesi: wajib publicApi() (tolak lintas situs) dan pembatasan laju di service.
      assert.ok(/=\s*publicApi\(/.test(source), file);
      assert.ok(!/export (async )?function (GET|POST|PUT|DELETE)/.test(source), 'handler tanpa publicApi(): ' + file);
      continue;
    }
    if (file.includes('/integration/')) {
      // Route antar-aplikasi wajib memakai tanda tangan HMAC, bukan sesi.
      assert.ok(/=\s*integrationApi\(/.test(source), file);
      assert.ok(!/export (async )?function (GET|POST|PUT|DELETE)/.test(source), 'handler tanpa integrationApi(): ' + file);
      continue;
    }
    assert.ok(/=\s*api\(/.test(source), file);
    assert.ok(!/export (async )?function (GET|POST|PUT|DELETE)/.test(source), 'handler tanpa api(): ' + file);
  }
});
