// Uji alur bisnis inti terhadap server development (mengubah data demo hse_dev).
// Pemakaian: node scripts/workflow.mjs http://localhost:3000
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const admin = Object.fromEntries(readFileSync('.env.admin.local', 'utf8').trim().split('\n').map((l) => l.split('=').map((x) => x.replace(/^"|"$/g, ''))));
const demo = {};
let section = '';
for (const line of readFileSync('.env.demo-users.local', 'utf8').split('\n')) {
  if (line.startsWith('# ')) section = line.slice(2);
  else if (line.includes(' = ')) { const [k, v] = line.split(' = '); demo[k === 'PIN' ? section : k] = v; }
}

async function login(email, password, extra = {}) {
  const jar = new Map();
  const keep = (res) => (res.headers.getSetCookie?.() ?? []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const c = await fetch(base + '/api/auth/csrf'); keep(c);
  const { csrfToken } = await c.json();
  keep(await fetch(base + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, ...extra }) }));
  const call = async (method, path, body, form) => {
    const res = await fetch(base + path, { method, headers: { cookie: cookie(), ...(form ? {} : body ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), form: (m, p, data) => { const f = new FormData(); f.set('data', JSON.stringify(data)); return call(m, p, null, f); } };
}

let failures = 0;
const check = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond || !extra ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!cond) failures++; };
const today = new Date().toISOString().slice(0, 10);

const ho = await login(admin.ADMIN_EMAIL, admin.ADMIN_PASSWORD);
const hse = await login('hse.tabang@demo.prohaba.co.id', demo['hse.tabang@demo.prohaba.co.id']);
const pjo = await login('pjo.tabang@demo.prohaba.co.id', demo['pjo.tabang@demo.prohaba.co.id']);
const sites = Object.fromEntries((await ho.get('/api/sites')).data.map((s) => [s.code, s]));

console.log('Personel & duplikasi NIK');
const nik = '64' + String(Date.now()).slice(-14).padStart(14, '0');
const created = await hse.form('POST', '/api/personnel', { nik, name: 'Uji Alur', category: 'MANPOWER', position: 'Helper', siteId: sites.TBG.id, ktpAddress: 'Jl. Uji 1', maritalStatus: 'MENIKAH' });
check(created.status === 200 && created.data.code, 'HSE Site menambah personel', created);
const dup = await hse.form('POST', '/api/personnel', { nik, name: 'Ganda', category: 'MANPOWER', position: 'Helper', siteId: sites.TBG.id, ktpAddress: 'x' });
check(dup.status === 409, 'NIK sama ditolak (satu NIK satu profil)', dup);
const staffNoBank = await hse.form('POST', '/api/personnel', { nik: '6499' + nik.slice(4), name: 'Staff Tanpa Rek', category: 'STAFF', position: 'Admin', siteId: sites.TBG.id, ktpAddress: 'x' });
check(staffNoBank.status === 400, 'Staff tanpa rekening ditolak', staffNoBank);
const otherSite = await hse.form('POST', '/api/personnel', { nik: '6498' + nik.slice(4), name: 'Lain Site', category: 'MANPOWER', position: 'Helper', siteId: sites.LHT.id, ktpAddress: 'x' });
check(otherSite.status === 403, 'HSE Tabang tidak bisa menambah personel ke Lahat', otherSite);
const pid = created.data.id;

console.log('Import Excel (preview → commit)');
const rows = [{ NIK: '6497' + nik.slice(4), Nama: 'Import Satu', 'Kategori (STAFF/MANPOWER/HARIAN_KANTOR)': 'MANPOWER', Jabatan: 'Helper', 'Kode Site': 'TBG', 'Alamat KTP': 'Jl. A' }, { NIK: nik, Nama: 'Duplikat', Kategori: 'MANPOWER', Jabatan: 'Helper', 'Kode Site': 'TBG', 'Alamat KTP': 'Jl. B' }, { NIK: '123', Nama: 'Salah', Kategori: 'X', 'Kode Site': 'ZZZ' }];
const prev = await hse.post('/api/personnel/import', { mode: 'preview', rows });
check(prev.data?.summary?.valid === 1 && prev.data.summary.duplicate === 1 && prev.data.summary.invalid === 1, 'Preview import memisahkan valid/duplikat/tidak valid', prev.data?.summary);
const commit = await hse.post('/api/personnel/import', { mode: 'commit', rows });
check(commit.data?.created === 1 && commit.data.skipped === 2, 'Commit import hanya menyimpan baris valid', commit.data);

console.log('MCU → status & permit');
const mcu = await hse.form('POST', '/api/mcu', { personnelId: pid, type: 'PRE_EMPLOYMENT', clinic: 'Klinik Uji', stage: 'SELESAI', screeningDate: today, mcuDate: today, result: 'FOLLOW_UP', feedbackDate: today });
check(mcu.status === 200 && mcu.data.fuDueDate, 'MCU FOLLOW UP menghasilkan batas FU otomatis', mcu.data);
const permitNoAck = await hse.form('POST', '/api/permits', { personnelId: pid, kind: 'PERMIT', permitType: 'SIMPER', number: 'UJI-' + Date.now(), startDate: today, endDate: new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10), basisResult: 'FOLLOW_UP' });
check(permitNoAck.status === 422, 'Permit 10 bulan untuk FOLLOW UP memerlukan konfirmasi', permitNoAck.data);
const sug = await hse.get(`/api/permits/suggest?personnelId=${pid}&startDate=${today}`);
check(sug.data?.mcu?.result === 'FOLLOW_UP' && sug.data.suggestedEnd, 'Saran permit sementara 3 bulan dari hasil MCU', sug.data);
const permit = await hse.form('POST', '/api/permits', { personnelId: pid, kind: 'PERMIT', permitType: 'SIMPER', number: 'UJI-' + Date.now(), startDate: today, endDate: sug.data.suggestedEnd.slice(0, 10), basisResult: 'FOLLOW_UP', isTemporary: true });
check(permit.status === 200, 'Permit sementara sesuai acuan tersimpan tanpa konfirmasi', permit.data);
const pjoMcu = await pjo.form('POST', '/api/mcu', { personnelId: pid, type: 'ANNUAL', clinic: 'x' });
check(pjoMcu.status === 403, 'PJO tidak dapat menginput MCU', pjoMcu);

console.log('Mutasi diajukan HSE Site, disahkan HO; riwayat tetap');
const mut = await hse.post('/api/placements/mutations', { personnelId: pid, toSiteId: sites.KTM.id, toPosition: 'Helper', effectiveDate: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), reason: 'Uji alur' });
check(mut.status === 200, 'Pengajuan mutasi', mut.data);
const selfDecide = await hse.post(`/api/placements/mutations/${mut.data.id}/decide`, { decision: 'APPROVE' });
check(selfDecide.status === 403, 'HSE Site tidak dapat mengesahkan mutasi', selfDecide);
const decide = await ho.post(`/api/placements/mutations/${mut.data.id}/decide`, { decision: 'APPROVE', note: 'OK' });
check(decide.status === 200, 'HO mengesahkan mutasi', decide.data);
const person = await ho.get('/api/personnel/' + pid);
const pl = person.data.placements;
check(pl.length === 2 && pl.filter((p) => p.status === 'ACTIVE').length === 1 && pl.find((p) => p.status === 'ENDED')?.endReason === 'MUTASI', 'Penempatan lama diakhiri, baru aktif, riwayat tersimpan', pl.map((p) => [p.status, p.endReason]));
const lost = await hse.get('/api/personnel/' + pid);
check(lost.status === 403, 'Setelah mutasi, HSE Tabang tidak lagi mengakses personel (pindah ke Kotim)', lost.status);

console.log('Performance → laporan bulanan: Draft → kirim → periksa → sahkan');
const daily = await hse.post('/api/performance/daily', { siteId: sites.TBG.id, date: today, manpower: 30, workHours: 10, overtimeHours: 12, excludedHours: 2 });
check(daily.data?.manhours === 310, 'Manhours harian dihitung otomatis', daily.data);
const prevMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
let rep = await hse.post('/api/reports', { siteId: sites.TBG.id, type: 'BULANAN', periodKey: prevMonth });
if (rep.status === 409) rep = { data: (await hse.get('/api/reports?type=BULANAN&siteId=' + sites.TBG.id)).data.rows.find((r) => r.periodKey === prevMonth) };
check(rep.data?.id, 'Draft laporan bulanan dibuat', rep);
const rid = rep.data.id;
const detail = await hse.get('/api/reports/' + rid);
check(detail.data?.summary?.manhours > 0 && detail.data.summary.activities.length > 0, 'Ringkasan otomatis dari HSE Performance (tanpa input ulang)', detail.data?.summary?.manhours);
await hse.form('PUT', '/api/reports/' + rid, { narrative: 'Aktivitas berjalan baik', constraints: 'Hujan', nextPlan: 'Lanjut' });
const hoEarly = await ho.post(`/api/reports/${rid}/transition`, { action: 'APPROVE' });
check(hoEarly.status === 403, 'HO tidak bisa mengesahkan sebelum diperiksa PJO/PM', hoEarly.status);
check((await hse.post(`/api/reports/${rid}/transition`, { action: 'SUBMIT' })).status === 200, 'HSE Site mengirim laporan');
check((await pjo.post(`/api/reports/${rid}/transition`, { action: 'RETURN_REVIEW', note: 'Lengkapi foto' })).data?.status === 'REVISION', 'PJO mengembalikan untuk revisi dengan catatan');
check((await hse.post(`/api/reports/${rid}/transition`, { action: 'SUBMIT' })).status === 200, 'HSE Site mengirim ulang (versi baru)');
check((await pjo.post(`/api/reports/${rid}/transition`, { action: 'REVIEW' })).data?.status === 'REVIEWED', 'PJO memeriksa');
check((await ho.post(`/api/reports/${rid}/transition`, { action: 'APPROVE', note: 'Sah' })).data?.status === 'APPROVED', 'HO mengesahkan');
const final = await ho.get('/api/reports/' + rid);
check(final.data.version === 2 && final.data.history.some((h) => h.action === 'REVISION') && final.data.history.some((h) => h.action === 'APPROVE' && h.snapshot), 'Riwayat revisi & arsip versi disahkan tersimpan', final.data.history.map((h) => h.action));

console.log('Notifikasi & audit');
const cron = await fetch(base + '/api/cron/reminders');
check(cron.status === 401, 'Endpoint cron menolak tanpa CRON_SECRET');
const notif = await hse.get('/api/notifications');
check(notif.data.total > 0, `Notifikasi pengingat tersedia (${notif.data.total})`);
const audit = await ho.get('/api/audit-log?module=placements');
check(audit.data.total > 0 && audit.data.rows.every((r) => !JSON.stringify(r).includes('v1:')), 'Audit log mencatat perubahan tanpa membuka data terenkripsi');

console.log(failures ? `\n${failures} pemeriksaan gagal` : '\nSemua alur lulus');
process.exit(failures ? 1 : 0);
