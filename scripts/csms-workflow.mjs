// Uji alur CSMS terhadap server development (mengubah data hse_dev, bukan produksi).
// Pemakaian: node scripts/csms-workflow.mjs http://localhost:3001 <file-akun>
// File akun berisi baris "email password" untuk akun uji HO_HSE, HSE_SITE (TBG), PJO (TBG) dan HRD,
// dengan email berawalan uji.ho / uji.site / uji.pjo / uji.hrd. Jangan isi kredensial produksi.
import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3001';
const accounts = Object.fromEntries(readFileSync(process.argv[3], 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
  const [email, password] = l.trim().split(/\s+/);
  return [email.split('@')[0].replace('uji.', ''), { email, password }];
}));

async function login({ email, password }) {
  const jar = new Map();
  const keep = (res) => (res.headers.getSetCookie?.() ?? []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const c = await fetch(base + '/api/auth/csrf'); keep(c);
  const { csrfToken } = await c.json();
  keep(await fetch(base + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password }) }));
  const call = async (method, path, body, form) => {
    const res = await fetch(base + path, { method, redirect: 'manual', headers: { cookie: cookie(), ...(form || !body ? {} : { 'Content-Type': 'application/json' }) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p),
    upload: (p, data, name = 'bukti-uji.pdf') => {
      const f = new FormData();
      f.set('data', JSON.stringify(data));
      f.append(p.startsWith('/api/documents') ? 'file' : 'files', new Blob(['%PDF-1.4\n% UJI CSMS ' + Date.now() + '\n%%EOF\n'], { type: 'application/pdf' }), name);
      return call('POST', p, null, f);
    },
  };
}

let failures = 0;
const check = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond || !extra ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); if (!cond) failures++; };

const [ho, site, pjo, hrd] = await Promise.all(['ho', 'site', 'pjo', 'hrd'].map((k) => login(accounts[k])));
const sites = (await ho.get('/api/sites')).data;
const siteList = Array.isArray(sites) ? sites : sites.rows ?? sites.sites;
const TBG = siteList.find((s) => s.code === 'TBG');
const LHT = siteList.find((s) => s.code === 'LHT');

console.log('1. Template: aktif dikunci');
let tpl = (await ho.get('/api/csms/templates')).data.rows.find((t) => t.code === 'AMM-VIB1-008A');
check(tpl?.check.items === 57 && tpl.check.total === 114 && tpl.check.diff === 0, 'template 008A: 57 butir, 114, selisih 0', tpl?.check);
if (tpl.status === 'DRAFT') check((await ho.post(`/api/csms/templates/${tpl.id}`, { action: 'ACTIVATE' })).status === 200, 'HO mengaktifkan template');
tpl = (await ho.get('/api/csms/templates')).data.rows.find((t) => t.code === 'AMM-VIB1-008A' && t.status === 'ACTIVE');
const locked = await ho.put(`/api/csms/templates/${tpl.id}`, { name: 'x', ownerName: 'x', sourceDocCode: 'x', sourceDocName: 'x' });
check(locked.status === 409, 'template aktif tidak dapat diubah (409)', locked);
check((await site.post('/api/csms/templates', { builtin: 'AMM-VIB1-008A' })).status === 403, 'HSE Site tidak dapat mengelola template');

console.log('2. Penerapan per site');
const apps = (await ho.get('/api/csms/applications')).data.rows;
let appT = apps.find((a) => a.siteId === TBG.id && a.status === 'ACTIVE');
if (!appT) appT = (await ho.post('/api/csms/applications', { siteId: TBG.id, templateId: tpl.id, startDate: '2026-01-01', requireReview: true, ownerRegisterNo: 'UJI-CMS-001', notes: 'Data uji CSMS' })).data;
let appL = apps.find((a) => a.siteId === LHT.id && a.status === 'ACTIVE');
if (!appL) appL = (await ho.post('/api/csms/applications', { siteId: LHT.id, templateId: tpl.id, startDate: '2026-01-01', notes: 'Data uji CSMS' })).data;
check(appT?.id && appL?.id, 'HO menerapkan template ke TBG (dengan PJO/PM) dan LHT');
check((await site.post('/api/csms/applications', { siteId: TBG.id, templateId: tpl.id, startDate: '2026-01-01' })).status === 403, 'HSE Site tidak dapat menetapkan penerapan');
const appDetail = (await ho.get(`/api/csms/applications/${appT.id}`)).data;
check(appDetail.requirements.length === 57, '57 persyaratan disalin ke site', appDetail.requirements.length);
const req = (code) => appDetail.requirements.find((r) => r.item?.internalCode === code);
const rPolicy = req('U01.01'), rAttend = req('U01.03'), rWaste = req('U11.05');
check((await ho.put(`/api/csms/requirements/${rAttend.id}`, { action: 'CONFIG', responsibility: 'SITE', frequency: 'MONTHLY', dueDays: 10, picRole: 'HSE_SITE', supportRoles: 'HRD' })).status === 200, 'HO atur U01.03 bulanan, tenggat +10 hari');
check((await ho.put(`/api/csms/requirements/${rPolicy.id}`, { action: 'CONFIG', responsibility: 'BERSAMA', frequency: 'ONCE', dueDate: '2026-02-01', picRole: 'HO_HSE' })).status === 200, 'HO atur U01.01 sekali, tenggat 2026-02-01');
check((await site.put(`/api/csms/requirements/${rAttend.id}`, { action: 'CONFIG', responsibility: 'SITE', frequency: 'DAILY' })).status === 403, 'HSE Site tidak dapat mengubah standar');

console.log('3. Batas akses site');
const lhtReq = (await ho.get(`/api/csms/applications/${appL.id}`)).data.requirements[0];
check((await site.get(`/api/csms/requirements/${lhtReq.id}`)).status === 403, 'HSE Site TBG tidak dapat membuka butir LHT');
check((await site.get(`/api/csms/applications/${appL.id}`)).status === 403, 'HSE Site TBG tidak dapat membuka penerapan LHT');
check((await hrd.get(`/api/csms/requirements/${rAttend.id}`)).status === 403, 'HRD tidak melihat butir yang PIC-nya bukan HRD');
check((await hrd.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: '2026-10', action: 'SAVE' })).status === 403, 'HRD tidak dapat mengisi');

console.log('4. Draft → ajukan → kembalikan (catatan wajib) → revisi → verifikasi');
// Pilih periode bulanan yang belum pernah diisi agar uji dapat diulang tanpa sisa data sebelumnya.
let P = null;
for (let m = 10; m >= 1 && !P; m--) {
  const key = `2026-${String(m).padStart(2, '0')}`;
  if ((await site.get(`/api/csms/requirements/${rAttend.id}?period=${key}`)).data.status === 'BELUM') P = key;
}
check(P, 'periode uji kosong ditemukan: ' + P);
const nextKey = `2026-${String(Number(P.slice(5)) + 1).padStart(2, '0')}`;
const noEv = await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'SUBMIT' });
check(noEv.status === 400, 'tidak dapat mengajukan tanpa bukti', noEv);
const up = await site.upload(`/api/csms/requirements/${rAttend.id}/evidence`, { periodKey: P, title: 'UJI Daftar hadir sosialisasi Oktober', evidenceDate: '2026-10-05' });
check(up.status === 200 && up.data.evidence.length === 1, 'HSE Site mengunggah bukti', up);
check((await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'SAVE', note: 'Draft uji' })).data?.status === 'DRAFT', 'draft tersimpan');
check((await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'SUBMIT', note: 'Pengajuan v1' })).data?.status === 'SUBMITTED', 'HSE Site mengajukan');
check((await ho.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'VERIFY' })).status === 409, 'HO tidak dapat melompati pemeriksaan PJO/PM');
check((await site.upload(`/api/csms/requirements/${rAttend.id}/evidence`, { periodKey: P, title: 'UJI tambahan' })).status === 409, 'bukti terkunci saat diajukan');
check((await pjo.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'RETURN' })).status === 400, 'kembalikan tanpa catatan ditolak');
check((await pjo.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'RETURN', note: 'Lampirkan foto sosialisasi' })).data?.status === 'REVISION', 'PJO mengembalikan dengan catatan');
const lib = (await site.get(`/api/csms/evidence?siteId=${TBG.id}`)).data.rows;
const reuse = lib.find((e) => e.id === up.data.evidence[0]);
const reuseRes = await site.post(`/api/csms/requirements/${rPolicy.id}/evidence`, { periodKey: 'AWAL', evidenceId: reuse.id });
check(reuseRes.status === 200 || reuseRes.data?.error?.includes('sudah ditautkan'), 'satu bukti ditautkan ke butir lain (U01.01) tanpa unggah ulang', reuseRes);
check((await site.upload(`/api/csms/requirements/${rAttend.id}/evidence`, { periodKey: P, title: 'UJI Foto sosialisasi' }, 'foto.pdf')).status === 200, 'HSE Site menambah bukti revisi');
check((await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'SUBMIT', note: 'Pengajuan v2' })).data?.status === 'SUBMITTED', 'HSE Site mengajukan versi baru');
check((await pjo.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'REVIEW', note: 'Sesuai' })).data?.status === 'REVIEWED', 'PJO memeriksa');
const ver = await ho.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'VERIFY', note: 'Terverifikasi (internal PJM)' });
check(ver.data?.status === 'VERIFIED', 'HO memverifikasi', ver);
const detail = (await ho.get(`/api/csms/requirements/${rAttend.id}?period=${P}`)).data;
const subs = detail.current.submissions;
check(subs.length >= 2 && subs.some((s) => s.outcome === 'RETURNED' && s.reviewNote === 'Lampirkan foto sosialisasi') && subs[0].outcome === 'VERIFIED', 'riwayat versi lama tetap ada (v1 dikembalikan, versi terakhir terverifikasi)', subs.map((s) => [s.version, s.outcome]));
check(subs[0].evidence.length === 2 && subs.at(-1).evidence.length === 1, 'snapshot bukti per versi tersimpan', subs.map((s) => s.evidence.length));

console.log('5. Periode berkala terpisah & tenggat');
const next = (await site.get(`/api/csms/requirements/${rAttend.id}?period=${nextKey}`)).data;
const pIds = detail.current.evidence.map((e) => e.id);
check(!next.current?.evidence.some((e) => pIds.includes(e.id)) && (next.status === 'BELUM' || next.current?.periodKey === nextKey), `bukti ${P} tidak otomatis memenuhi ${nextKey} (status ${nextKey}: ${next.status})`);
check(detail.current.dueDate?.startsWith(`${nextKey}-10`), `tenggat ${P} = tanggal 10 bulan berikutnya`, detail.current.dueDate);
check((await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: '2026-13', action: 'SAVE' })).status === 400, 'kunci periode tidak valid ditolak');

console.log('6. N/A wajib alasan & persetujuan HO');
check((await site.put(`/api/csms/requirements/${rWaste.id}`, { action: 'REQUEST_NA' })).status === 400, 'usulan N/A tanpa alasan ditolak');
const naReq = await site.put(`/api/csms/requirements/${rWaste.id}`, { action: 'REQUEST_NA', reason: 'UJI: tidak memakai bahan kimia' });
check(naReq.data?.applicability === 'NA_PENDING' || naReq.status === 409, 'HSE Site mengusulkan N/A', naReq);
check((await site.put(`/api/csms/requirements/${rWaste.id}`, { action: 'APPROVE_NA' })).status === 403, 'HSE Site tidak dapat menyetujui N/A');
check((await ho.put(`/api/csms/requirements/${rWaste.id}`, { action: 'REJECT_NA', reason: 'UJI dikembalikan' })).data?.applicability === 'APPLICABLE' || naReq.status === 409, 'HO memutuskan usulan N/A');

console.log('7. Dokumen induk HO: tautan tanpa unggah ulang & akses terbatas');
const num = 'UJI-CSMS-' + Date.now();
const doc = await ho.upload('/api/documents', { number: num, title: 'UJI Kebijakan K3LH (dokumen induk)', category: 'COMPLIANCE_OWNER', siteId: '', issueDate: '2026-01-02', ownerName: 'HO HSE', status: 'BERLAKU', revision: '0' }, 'kebijakan.pdf');
check(doc.status === 200, 'HO menambah dokumen di Dokumen HSE', doc);
const docId = doc.data.id;
check((await ho.put(`/api/csms/documents/${docId}`, { accessScope: 'HO_ONLY', itemIds: [rPolicy.item.id], approverName: 'Direktur Utama' })).status === 200, 'HO menautkan ke butir U01.01, akses terbatas HO');
const hidden = (await site.get(`/api/csms/linkable-documents?siteId=${TBG.id}&q=${num}`)).data.rows;
check(hidden.length === 0, 'dokumen terbatas tidak muncul untuk site');
const docFile = (await ho.get(`/api/csms/requirements/${rPolicy.id}?period=AWAL`)).data.masterDocs.find((d) => d.id === docId)?.versions[0]?.fileId;
check(docFile && (await site.get(`/api/files/${docFile}`)).status === 403, 'file dokumen terbatas tidak dapat diunduh site (403)');
check((await ho.put(`/api/csms/documents/${docId}`, { accessScope: 'LISTED', siteIds: [TBG.id], itemIds: [rPolicy.item.id] })).status === 200, 'HO membuka dokumen untuk TBG saja');
check((await site.post(`/api/csms/requirements/${rPolicy.id}/evidence`, { periodKey: 'AWAL', documentId: docId })).status === 200, 'HSE Site menautkan dokumen induk sebagai bukti tanpa unggah ulang');
check((await site.get(`/api/files/${docFile}`)).status === 200, 'site terpilih dapat mengunduh dokumen');

console.log('8. Notifikasi menuju item yang benar');
const notes = (await pjo.get('/api/notifications')).data.rows.filter((n) => n.type === 'CSMS');
check(notes.some((n) => n.link === `/csms/requirements/${rAttend.id}?period=${P}`), 'PJO menerima notifikasi pengajuan dengan tautan ke butir & periode', notes.map((n) => n.link).slice(0, 3));
const siteNotes = (await site.get('/api/notifications')).data.rows.filter((n) => n.type === 'CSMS');
check(siteNotes.some((n) => /perlu revisi/.test(n.title)) && siteNotes.some((n) => /terverifikasi/.test(n.title)), 'HSE Site menerima notifikasi revisi & terverifikasi');

console.log('9. Bukti terverifikasi diubah → diperiksa ulang');
check((await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'REVISE' })).data?.status === 'DRAFT', 'ubah bukti terverifikasi kembali ke Draft');
const after = (await ho.get(`/api/csms/requirements/${rAttend.id}?period=${P}`)).data.current.submissions;
check(after.some((s) => s.outcome === 'VERIFIED'), 'catatan verifikasi lama tetap tersimpan');
// Kembalikan ke status terverifikasi agar data uji konsisten.
await site.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'SUBMIT', note: 'Pengajuan ulang uji' });
await pjo.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'REVIEW' });
await ho.post(`/api/csms/requirements/${rAttend.id}/fulfillment`, { periodKey: P, action: 'VERIFY' });

console.log('10. Halaman tetap terbuka');
for (const [who, c, path] of [['HO', ho, '/csms?tab=summary'], ['HO', ho, '/csms?tab=documents'], ['HO', ho, `/csms/applications/${appT.id}`], ['HO', ho, `/csms/templates/${tpl.id}`], ['Site', site, '/csms?tab=checklist'], ['Site', site, `/csms/requirements/${rAttend.id}?period=${P}`], ['PJO', pjo, '/csms?tab=verify'], ['HRD', hrd, '/csms?tab=summary'], ['Site', site, '/documents'], ['HO', ho, '/approvals']]) {
  const r = await c.get(path);
  check(r.status === 200, `${who} ${path} → ${r.status}`);
}
const setupAsSite = await site.get('/csms/templates/' + tpl.id);
check(setupAsSite.status === 307, 'HSE Site diarahkan keluar dari halaman template', setupAsSite.status);

console.log(failures ? `\n${failures} pemeriksaan gagal` : '\nSemua pemeriksaan lulus');
process.exit(failures ? 1 : 0);
