import test from 'node:test';
import assert from 'node:assert/strict';
import { QUOTES, greetingFor, quoteOfDay } from '../src/lib/domain/greeting.js';

test('sapaan mengikuti jam setempat', () => {
  const cases = { 3: 'malam', 4: 'pagi', 10: 'pagi', 11: 'siang', 14: 'siang', 15: 'sore', 17: 'sore', 18: 'malam', 23: 'malam' };
  for (const [hour, word] of Object.entries(cases)) assert.equal(greetingFor(Number(hour)), 'Selamat ' + word, hour);
});

test('kata motivasi tetap sepanjang hari dan berganti esok harinya', () => {
  assert.equal(new Set(QUOTES).size, QUOTES.length);
  assert.equal(quoteOfDay(new Date(2026, 10, 4, 0, 1)), quoteOfDay(new Date(2026, 10, 4, 23, 59)));
  for (let d = 1; d < 28; d++) assert.notEqual(quoteOfDay(new Date(2026, 1, d, 12)), quoteOfDay(new Date(2026, 1, d + 1, 12)));
});
