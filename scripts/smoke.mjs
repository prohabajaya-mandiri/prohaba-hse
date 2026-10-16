// Smoke test HTTP untuk development: login tiap peran demo, buka semua halaman, cek isolasi site.
// Pemakaian: node scripts/smoke.mjs http://localhost:3000   (butuh .env.admin.local & .env.demo-users.local)
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const admin = Object.fromEntries(readFileSync('.env.admin.local', 'utf8').trim().split('\n').map((l) => l.split('=').map((x) => x.replace(/^"|"$/g, ''))));
// Baris "PIN = x" disimpan dengan kunci judul bagiannya, mis. "OPERATOR Doni @ hse.lahat".
const demo = {};
let section = '';
for (const line of readFileSync('.env.demo-users.local', 'utf8').split('\n')) {
  if (line.startsWith('# ')) section = line.slice(2);
  else if (line.includes(' = ')) {
    const [k, v] = line.split(' = ');
    demo[k === 'PIN' ? section : k] = v;
  }
}

async function login(email, password, extra = {}) {
  const jar = new Map();
  const keep = (res) => (res.headers.getSetCookie?.() ?? []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrfRes = await fetch(base + '/api/auth/csrf');
  keep(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(base + '/api/auth/callback/credentials', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, ...extra, json: 'true' }),
  });
  keep(res);
  const ok = [...jar.keys()].some((k) => k.includes('session-token'));
  return { ok, get: (p) => fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }) };
}

const PAGES = ['/dashboard', '/notifications', '/approvals', '/personnel', '/placements', '/roster', '/roster?tab=leaves', '/roster?tab=policies', '/mobilization', '/mcu', '/permits',
  '/training', '/training?tab=sessions', '/training?tab=gaps', '/training?tab=master', '/performance', '/performance?tab=input', '/performance?tab=activities', '/performance?tab=indicators',
  '/reports', '/incidents', '/documents', '/hrd', '/sites', '/users', '/settings', '/audit-log', '/account'];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  ✗ ' + msg); } };

const accounts = [['HO_HSE', admin.ADMIN_EMAIL, admin.ADMIN_PASSWORD], ...Object.entries(demo).filter(([e]) => e.includes('@demo')).map(([e, p]) => [e, e, p])];
for (const [label, email, password] of accounts) {
  const extra = email.startsWith('hse.lahat') ? { operator: 'Doni', pin: demo['OPERATOR Doni @ hse.lahat'] } : {};
  const s = await login(email, password, extra);
  console.log(`${label}: login ${s.ok ? 'OK' : 'GAGAL'}`);
  if (!s.ok) { failures++; continue; }
  for (const p of PAGES) {
    const r = await s.get(p);
    check(r.status < 500, `${p} → ${r.status}`);
    if (r.status >= 500) console.log((await r.text()).slice(0, 300));
  }
}

// Isolasi: HSE Tabang tidak dapat melihat personel / file site Lahat.
const ho = await login(admin.ADMIN_EMAIL, admin.ADMIN_PASSWORD);
const all = await (await ho.get('/api/personnel?former=all')).json();
const sitesRes = await (await ho.get('/api/sites')).json();
const lht = sitesRes.find((x) => x.code === 'LHT');
const lahatPeople = await (await ho.get('/api/personnel?siteId=' + lht.id)).json();
const hse = await login('hse.tabang@demo.prohaba.co.id', demo['hse.tabang@demo.prohaba.co.id']);
const mine = await (await hse.get('/api/personnel?former=all')).json();
check(mine.total < all.total && mine.total > 0, `HSE Tabang melihat ${mine.total} dari ${all.total} personel`);
const target = lahatPeople.rows[0];
const detail = await hse.get('/api/personnel/' + target.id);
check(detail.status === 403, 'Detail personel Lahat oleh HSE Tabang → ' + detail.status);
const sens = await hse.get(`/api/personnel/${target.id}/sensitive?kind=KTP`);
check(sens.status === 403, 'Data KTP Lahat oleh HSE Tabang → ' + sens.status);
const filtered = await (await hse.get('/api/personnel?siteId=' + lht.id)).json();
check(filtered.total === 0, 'Filter siteId Lahat oleh HSE Tabang mengembalikan ' + filtered.total);
const pjo = await login('pjo.tabang@demo.prohaba.co.id', demo['pjo.tabang@demo.prohaba.co.id']);
const pjoWrite = await fetch(base + '/api/personnel/' + target.id + '/status', { method: 'POST' });
check(pjoWrite.status === 401, 'POST tanpa sesi → ' + pjoWrite.status);
const pjoHrd = await pjo.get('/api/hrd');
check(pjoHrd.status === 403, 'PJO membuka API HRD → ' + pjoHrd.status);
console.log(failures ? `\n${failures} pemeriksaan gagal` : '\nSemua pemeriksaan lulus');
process.exit(failures ? 1 : 0);
