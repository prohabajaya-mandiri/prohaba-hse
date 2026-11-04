import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, ROLES } from '../src/lib/access.js';

test('Pusat Bantuan hanya untuk HO HSE; semua peran dapat mengirim aduan', () => {
  for (const role of ROLES) {
    assert.equal(canAccess(role, '/help'), role === 'HO_HSE', role);
    assert.equal(canAccess(role, '/api/support', 'POST'), true, role);
  }
});

test('HSE Site dapat melengkapi data site; peran lain hanya membaca', () => {
  for (const role of ROLES) assert.equal(canAccess(role, '/api/sites/abc/projects', 'POST'), ['HO_HSE', 'HSE_SITE'].includes(role), role);
});
