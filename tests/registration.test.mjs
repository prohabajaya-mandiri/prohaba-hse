import test from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, localTodayIso, mcuIso, registrationChecks, startDateInWindow, waNumber } from '../src/lib/domain/registration.js';
import { canAccess } from '../src/lib/access.js';

test('tanggal mulai kerja: default hari ini (jam perangkat), MCU H+1, rentang wajar', () => {
  assert.equal(localTodayIso(new Date(2026, 9, 26, 23, 30)), '2026-10-26');
  assert.equal(mcuIso('2026-10-31'), '2026-11-01');
  assert.equal(mcuIso(''), null);
  const today = new Date('2026-10-26T00:00:00Z');
  assert.equal(startDateInWindow(new Date('2026-10-26T00:00:00Z'), today), true);
  assert.equal(startDateInWindow(new Date('2026-08-27T00:00:00Z'), today), true); // 60 hari lalu
  assert.equal(startDateInWindow(new Date('2026-08-26T00:00:00Z'), today), false);
  assert.equal(startDateInWindow(new Date('2027-01-24T00:00:00Z'), today), true); // 90 hari ke depan
  assert.equal(startDateInWindow(new Date('2027-01-25T00:00:00Z'), today), false);
});

test('umur dihitung dari tanggal lahir', () => {
  assert.equal(ageOn('2000-10-27', new Date('2026-10-26T00:00:00Z')), 25);
  assert.equal(ageOn('2000-10-26', new Date('2026-10-26T00:00:00Z')), 26);
  assert.equal(ageOn('2030-01-01', new Date('2026-10-26T00:00:00Z')), null);
  // Server memvalidasi tanggal lahir sebagai objek Date (hasil date()), bukan teks.
  assert.equal(ageOn(new Date('2001-07-05T00:00:00Z'), new Date('2026-10-26T00:00:00Z')), 25);
  assert.equal(ageOn(new Date('invalid'), new Date('2026-10-26T00:00:00Z')), null);
  assert.equal(ageOn('bukan tanggal'), null);
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

test('kamera KTP memotong tepat area bingkai (object-fit: cover)', async () => {
  const { coverCrop } = await import('../src/lib/domain/camera-crop.js');
  // Video 1920×1080 tampil di layar HP 375×700: diskalakan mengikuti tinggi, sisi kiri-kanan terpotong.
  const view = { left: 0, top: 0, width: 375, height: 700 };
  const scale = 700 / 1080;
  const frame = { left: 20, top: 250, width: 335, height: 335 / (85.6 / 54) };
  const r = coverCrop(view, frame, 1920, 1080);
  const offX = (375 - 1920 * scale) / 2;
  assert.ok(Math.abs(r.sx - (20 - offX) / scale) < 1e-6);
  assert.ok(Math.abs(r.sy - 250 / scale) < 1e-6);
  assert.ok(Math.abs(r.sw / r.sh - 85.6 / 54) < 1e-6, 'rasio hasil = rasio KTP');
  // Margin tidak boleh keluar dari batas video.
  const edge = coverCrop(view, { left: 0, top: 0, width: 375, height: 700 }, 1920, 1080, 0.1);
  assert.ok(edge.sx >= 0 && edge.sy >= 0 && edge.sx + edge.sw <= 1920 && edge.sy + edge.sh <= 1080);
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
