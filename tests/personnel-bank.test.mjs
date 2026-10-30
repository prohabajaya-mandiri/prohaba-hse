import test from 'node:test';
import assert from 'node:assert/strict';

// parsePersonnel tidak menyentuh database; URL dummy hanya agar modul prisma dapat dimuat.
process.env.DATABASE_URL ??= 'postgresql://test@localhost:5432/test';
const { parsePersonnel, syncRow } = await import('../src/lib/services/personnel.js');

const hrd = { role: 'HRD' };
const base = { nik: '6401010101900001', name: 'Budi', ktpAddress: 'Jl. Mawar 1', position: 'Admin' };

test('karyawan (termasuk STAFF) dapat disimpan tanpa rekening', () => {
  for (const category of ['STAFF', 'MANPOWER']) {
    const { v, sensitive } = parsePersonnel({ ...base, category }, null, { user: hrd });
    assert.equal(v.bankName, null);
    assert.equal(v.bankAccountName, null);
    assert.equal(sensitive.bankAccount, undefined);
  }
  const blank = parsePersonnel({ ...base, category: 'STAFF', bankName: '', bankAccount: '', bankAccountName: '' }, null, { user: hrd });
  assert.equal(blank.sensitive.bankAccount, null);
});

test('rekening yang diisi tetap divalidasi formatnya', () => {
  const ok = parsePersonnel({ ...base, category: 'STAFF', bankName: 'BRI', bankAccount: '0123 4567 89', bankAccountName: 'Budi' }, null, { user: hrd });
  assert.equal(ok.sensitive.bankAccount, '0123456789');
  assert.equal(ok.v.bankName, 'BRI');
  assert.throws(() => parsePersonnel({ ...base, category: 'STAFF', bankAccount: 'abc12' }, null, { user: hrd }), /No rekening hanya angka/);
  assert.throws(() => parsePersonnel({ ...base, category: 'STAFF', bankName: 'B'.repeat(61) }, null, { user: hrd }), /Nama bank/);
  // Mode import mengumpulkan kesalahan tanpa melempar.
  const errors = [];
  parsePersonnel({ ...base, category: 'STAFF', bankAccount: '12' }, null, { user: hrd, errors });
  assert.deepEqual(errors, ['No rekening hanya angka (5–30 digit).']);
});

test('umpan ERP hanya membawa tanda rekening terisi, tanpa nomor terenkripsi', () => {
  const row = (bankAccountEnc) => syncRow({ id: 'p1', bankName: null, bankAccountEnc, currentSite: null, placements: [], mcus: [], permits: [] });
  assert.equal(row(null).hasBankAccount, false);
  assert.equal(row('v1:abc').hasBankAccount, true);
  assert.ok(!('bankAccountEnc' in row('v1:abc')));
});
