import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, arrivalIso, mcuIso, registrationChecks, waNumber } from '../src/lib/domain/registration.js';
import { canAccess } from '../src/lib/access.js';

test('tanggal tiba memakai kalender WITA (Balikpapan), MCU H+1', () => {
  // 23.30 WITA tanggal 26 = 22.30 WIB tanggal 26 = 15.30 UTC.
  assert.equal(arrivalIso(new Date('2026-10-26T15:30:00Z')), '2026-10-26');
  // 00.30 WITA tanggal 27 masih tanggal 26 di WIB — tetap tercatat 27 (WITA).
  assert.equal(arrivalIso(new Date('2026-10-26T16:30:00Z')), '2026-10-27');
  assert.equal(mcuIso('2026-10-31'), '2026-11-01');
});

test('umur dihitung dari tanggal lahir', () => {
  assert.equal(ageOn('2000-10-27', new Date('2026-10-26T00:00:00Z')), 25);
  assert.equal(ageOn('2000-10-26', new Date('2026-10-26T00:00:00Z')), 26);
  assert.equal(ageOn('2030-01-01', new Date('2026-10-26T00:00:00Z')), null);
});

test('nomor WA dinormalisasi ke format internasional', () => {
  assert.equal(waNumber('0812-3456-7890'), '6281234567890');
  assert.equal(waNumber('+62 812 3456 7890'), '6281234567890');
  assert.equal(waNumber('81234567890'), '6281234567890');
  assert.equal(waNumber(''), null);
});

test('pemeriksaan otomatis: NIK vs tanggal lahir, umur, duplikat', () => {
  const today = new Date('2026-10-26T00:00:00Z');
  const ok = registrationChecks({ nik: '6402011203900001', birthDate: '1990-03-12', gender: 'L', hasKtp: true }, { today });
  assert.ok(ok.every((c) => c.ok), JSON.stringify(ok));
  const bad = registrationChecks({ nik: '6402011203900001', birthDate: '1991-03-12', gender: 'L', hasKtp: false },
    { today, existing: { name: 'Budi', nip: '123', isFormer: false }, pendingDupes: 1 });
  const byKey = Object.fromEntries(bad.map((c) => [c.key, c]));
  assert.equal(byKey.birth.ok, false);
  assert.equal(byKey.ktp.ok, false);
  assert.equal(byKey.existing.level, 'danger');
  assert.equal(byKey.dupe.ok, false);
  const young = registrationChecks({ nik: '6402011203100001', birthDate: '2010-03-12', hasKtp: true }, { today });
  assert.equal(young.find((c) => c.key === 'age').level, 'danger');
});

test('verifikasi pendaftaran hanya HO HSE & HRD', () => {
  assert.equal(canAccess('HO_HSE', '/registrations'), true);
  assert.equal(canAccess('HRD', '/api/registrations/x/approve', 'POST'), true);
  assert.equal(canAccess('HSE_SITE', '/registrations'), false);
  assert.equal(canAccess('HSE_SITE', '/api/registrations/x/approve', 'POST'), false);
  assert.equal(canAccess('DIREKSI', '/api/registrations', 'GET'), false);
});

test('langkah Sesuaikan: posisi awal menutupi bingkai & hasil potong mengikuti geser/zoom', async () => {
  const { coverFit, frameCrop } = await import('../src/lib/domain/camera-crop.js');
  const frame = { left: 20, top: 200, width: 335, height: 335 / (85.6 / 54) };
  // Foto galeri tegak 3000×4000: diskalakan mengikuti lebar bingkai, berada di tengah.
  const fit = coverFit(frame, 3000, 4000);
  assert.ok(Math.abs(fit.scale - 335 / 3000) < 1e-9);
  assert.ok(Math.abs(fit.imgLeft - 20) < 1e-9);
  const c = frameCrop({ frame, ...fit, iw: 3000, ih: 4000 }, 1600);
  assert.equal(c.outW, 1600);
  assert.ok(Math.abs(c.outH - 1600 * 54 / 85.6) < 1);
  assert.ok(Math.abs(c.sw - 3000) < 1e-6 && c.dx === 0 && Math.abs(c.dw - 1600) < 1e-6, 'lebar bingkai = lebar foto');
  assert.ok(Math.abs(c.sy + c.sh / 2 - 2000) < 1e-6, 'potongan berada di tengah foto');
  // Foto digeser ke kanan melewati tepi kiri bingkai: sisi kiri hasil kosong, sumber mulai dari x=0.
  const shifted = frameCrop({ frame, imgLeft: 120, imgTop: fit.imgTop, scale: fit.scale, iw: 3000, ih: 4000 }, 1600);
  assert.equal(shifted.sx, 0);
  assert.ok(Math.abs(shifted.dx - 100 * (1600 / 335)) < 1e-6);
  assert.ok(shifted.dx + shifted.dw <= 1600 + 1e-6);
});
