import test from 'node:test';
import assert from 'node:assert/strict';
import { signedHeaders, verify, HEADERS, decodeActor } from '../src/lib/integration-signature.js';

const secret = 'x'.repeat(48);
process.env.INTEGRATION_CENTER_SECRET = secret;
const { authenticate, integrationUser } = await import('../src/lib/integration.js');

const actor = { id: 'u1', name: 'Rina HRD', role: 'HRD' };
const now = Date.UTC(2026, 9, 19, 3, 0, 0);
const path = '/api/integration/v1/personnel?q=budi';

function request(method, headers, body) {
  return new Request('https://hse.test' + path, { method, headers, body });
}

test('tanda tangan valid diterima dan dipetakan ke peran E-HSE', () => {
  const h = signedHeaders(secret, { client: 'center', method: 'GET', path, body: '', actor, now });
  const user = authenticate(request('GET', h), Buffer.alloc(0), now);
  assert.equal(user.role, 'HRD');
  assert.equal(user.integration, 'center');
  assert.equal(user.name, 'Rina HRD (ERP Center)');
});

test('isi, URL, pelaku, waktu atau secret yang berbeda ditolak', () => {
  const body = JSON.stringify({ workStatus: 'RESIGN' });
  const h = signedHeaders(secret, { client: 'center', method: 'POST', path, body, actor, now });
  const parts = { client: 'center', timestamp: h[HEADERS.timestamp], method: 'POST', path, body, actor: h[HEADERS.actor] };
  assert.equal(verify(secret, parts, h[HEADERS.signature], now), true);
  assert.equal(verify(secret, { ...parts, body: '{}' }, h[HEADERS.signature], now), false);
  assert.equal(verify(secret, { ...parts, path: path + '&x=1' }, h[HEADERS.signature], now), false);
  assert.equal(verify(secret, { ...parts, method: 'PUT' }, h[HEADERS.signature], now), false);
  const forged = Buffer.from(JSON.stringify({ ...actor, role: 'TOP_MANAGEMENT' })).toString('base64url');
  assert.equal(verify(secret, { ...parts, actor: forged }, h[HEADERS.signature], now), false);
  assert.equal(verify(secret, parts, h[HEADERS.signature], now + 301000), false);
  assert.equal(verify('y'.repeat(48), parts, h[HEADERS.signature], now), false);
  assert.equal(verify(secret, parts, 'v1=00', now), false);
});

test('klien atau peran yang tidak dikenal ditolak; Direksi hanya baca', () => {
  assert.equal(integrationUser('center', { ...actor, role: 'FINANCE' }), null);
  assert.equal(integrationUser('lain', actor), null);
  assert.equal(integrationUser('center', { ...actor, role: 'TOP_MANAGEMENT' }).role, 'DIREKSI');
  assert.equal(decodeActor('bukan-json'), null);
  const h = signedHeaders(secret, { client: 'lain', method: 'GET', path, body: '', actor, now });
  assert.equal(authenticate(request('GET', h), Buffer.alloc(0), now), null);
});
