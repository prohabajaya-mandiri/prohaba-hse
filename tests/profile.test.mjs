import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, ROLES } from '../src/lib/access.js';
import { DEFAULT_THEME, THEME_COLORS, THEME_KEYS } from '../src/lib/domain/profile.js';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('warna tema: kunci unik dan teks putih pada tombol tetap terbaca (kontras ≥ 4.5)', () => {
  assert.equal(new Set(THEME_KEYS).size, THEME_COLORS.length);
  assert.ok(THEME_KEYS.includes(DEFAULT_THEME));
  for (const t of THEME_COLORS) assert.ok(1.05 / (luminance(t.color) + 0.05) >= 4.5, t.key);
});

test('profil dapat diubah oleh semua peran, termasuk memuat foto lewat /api/files', () => {
  for (const role of ROLES) {
    for (const p of ['/api/account/profile', '/api/account/theme', '/api/account/avatar']) assert.equal(canAccess(role, p, 'PUT'), true, role + p);
    assert.equal(canAccess(role, '/api/files/abc', 'GET'), true, role);
  }
});
