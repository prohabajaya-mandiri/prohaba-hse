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
    cookie, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p),
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

console.log('11. Zona waktu site');
const tz = await ho.put(`/api/sites/${TBG.id}`, { code: TBG.code, name: TBG.name, location: TBG.location ?? '', region: TBG.region, timezone: 'Asia/Makassar', isHo: false, isActive: TBG.isActive });
check(tz.status === 200, 'HO menetapkan zona waktu TBG = WITA', tz);
check((await site.get(`/api/csms/requirements/${rAttend.id}?period=${P}`)).data.tz === 'WITA', 'tenggat TBG ditampilkan dengan WITA');
const resp = await ho.post(`/api/sites/${TBG.id}/responsibles`, { role: 'SAFETY_OFFICER', name: 'UJI Safety Officer', phone: '0812000000', email: 'so@uji.local', startDate: '2026-10-29' });
check(resp.status === 200 || resp.data?.error?.includes('setelah'), 'HO mencatat Safety Officer di Site & Proyek', resp);

console.log('12. Bukti dari data modul (tanpa input ulang)');
const rMcu = req('U12.02'), rStat = req('U06.05');
const srcMcu = (await site.get(`/api/csms/requirements/${rMcu.id}/sources?period=AWAL`)).data;
check(srcMcu.suggested?.[0]?.type === 'MCU' && srcMcu.groups.some((g) => g.type === 'MCU' && g.suggested), 'U12.02 menyarankan sumber MCU', srcMcu.suggested);
const mcuOpt = srcMcu.groups.find((g) => g.type === 'MCU')?.options[0];
if (mcuOpt) {
  check(!/[A-Z][a-z]+ [A-Z][a-z]+/.test(mcuOpt.summary.replace(/Belum MCU|Proses MCU|FU terlambat|MCU kedaluwarsa|FOLLOW UP/g, '')), 'ringkasan MCU tanpa nama personel', mcuOpt.summary);
  const linked = await site.post(`/api/csms/requirements/${rMcu.id}/sources`, { periodKey: 'AWAL', key: mcuOpt.key });
  check(linked.status === 200, 'HSE Site menautkan rekap MCU sebagai bukti', linked);
  const ev = (await site.get(`/api/csms/requirements/${rMcu.id}?period=AWAL`)).data.current.evidence.find((e) => e.kind === 'SOURCE');
  check(ev?.snapshot?.counts && ev.source?.link?.startsWith('/mcu'), 'bukti menyimpan snapshot angka & tautan ke modul MCU', ev);
} else console.log('  (dev: tidak ada personel aktif di TBG untuk rekap MCU)');
check((await site.post(`/api/csms/requirements/${rMcu.id}/sources`, { periodKey: 'AWAL', key: 'MCU:PALSU' })).status === 404, 'kunci sumber palsu ditolak (ringkasan dihitung ulang di server)');
check((await hrd.get(`/api/csms/requirements/${rStat.id}/sources?period=AWAL`)).status === 403, 'HRD tidak dapat menarik sumber untuk butir non-HRD');
const srcStat = (await site.get(`/api/csms/requirements/${rStat.id}/sources?period=AWAL`)).data;
check(srcStat.groups.find((g) => g.type === 'PERFORMANCE')?.suggested, 'U06.05 menyarankan statistik HSE Performance');

console.log('13. Temuan & tindak lanjut');
const fnd = await site.post('/api/csms/findings', { siteId: TBG.id, source: 'INSPEKSI', requirementId: rAttend.id, description: 'UJI: APAR area workshop kedaluwarsa', picRole: 'HSE_SITE', dueDate: '2026-11-05' });
check(fnd.status === 200 && fnd.data.number?.startsWith('TMN-'), 'HSE Site mencatat temuan bernomor', fnd);
const fid = fnd.data.id;
check((await site.post('/api/csms/findings', { siteId: LHT.id, source: 'INSPEKSI', description: 'x' })).status === 403, 'HSE Site TBG tidak dapat mencatat temuan LHT');
check((await site.post(`/api/csms/findings/${fid}`, { action: 'SUBMIT_CLOSE' })).status === 400, 'tidak dapat mengajukan penutupan tanpa tindakan perbaikan');
check((await site.put(`/api/csms/findings/${fid}`, { correctiveAction: 'APAR diganti & dicek ulang' })).status === 200, 'HSE Site mengisi tindakan perbaikan');
check((await site.post(`/api/csms/findings/${fid}`, { action: 'SUBMIT_CLOSE' })).status === 400, 'tidak dapat mengajukan penutupan tanpa bukti');
const ff = new FormData(); ff.append('files', new Blob(['%PDF-1.4\n% UJI temuan\n%%EOF\n'], { type: 'application/pdf' }), 'apar.pdf');
const upF = await fetch(base + `/api/csms/findings/${fid}/files`, { method: 'POST', body: ff, headers: { cookie: site.cookie() } }).then(async (r) => ({ status: r.status, data: await r.json() }));
check(upF.status === 200, 'HSE Site mengunggah bukti penyelesaian', upF);
const afterUp = (await site.get(`/api/csms/findings/${fid}`)).data;
check(afterUp.status === 'TERBUKA', 'unggahan bukti tidak menutup temuan');
check((await site.post(`/api/csms/findings/${fid}`, { action: 'SUBMIT_CLOSE' })).data?.status === 'DIAJUKAN_TUTUP', 'HSE Site mengajukan penutupan');
check((await site.post(`/api/csms/findings/${fid}`, { action: 'CLOSE' })).status === 409, 'HSE Site tidak dapat menutup temuan');
check((await ho.post(`/api/csms/findings/${fid}`, { action: 'RETURN' })).status === 400, 'pengembalian tanpa alasan ditolak');
check((await ho.post(`/api/csms/findings/${fid}`, { action: 'CLOSE', note: 'Terverifikasi' })).data?.status === 'DITUTUP', 'HO menutup temuan setelah verifikasi');
const fileId = afterUp.files[0]?.id;
check(fileId && (await hrd.get(`/api/files/${fileId}`)).status === 403, 'HRD tidak dapat mengunduh bukti temuan');
check((await ho.post(`/api/csms/findings/${fid}`, { action: 'REOPEN', note: 'UJI dibuka kembali' })).data?.status === 'DALAM_PROSES', 'HO membuka kembali dengan alasan');
const hist = (await ho.get(`/api/csms/findings/${fid}`)).data.history.map((h) => h.action);
check(['CREATE', 'SUBMIT_CLOSE', 'CLOSE', 'REOPEN'].every((a) => hist.includes(a)), 'riwayat temuan lengkap', hist);
check((await hrd.get('/api/csms/findings')).data.rows.length === 0, 'HRD tidak melihat register temuan');

console.log('14. Profil perusahaan & site (008B)');
check((await site.put('/api/csms/profile', { name: 'x' })).status === 403, 'HSE Site tidak dapat mengubah legalitas perusahaan');
check((await ho.put('/api/csms/profile', { name: 'PT. Prohaba Jaya Mandiri', businessCategory: 'NON_INTI', businessScale: 'NASIONAL', iujpNumber: 'UJI-IUJP-001', iujpExpiry: '2027-12-31', hoAddress: 'UJI alamat HO' })).status === 200, 'HO menyimpan profil perusahaan');
check((await site.put(`/api/csms/profile/sites/${TBG.id}`, { riskLevel: 'RENDAH' })).status === 400, 'HSE Site tidak dapat menetapkan tingkat risiko');
check((await site.put(`/api/csms/profile/sites/${TBG.id}`, { siteAddress: 'UJI jalan tambang km 10', province: 'Kalimantan Timur', regency: 'Kutai Kartanegara', workScope: 'UJI lingkup pekerjaan' })).status === 200, 'HSE Site memperbarui data operasional site');
check((await ho.put(`/api/csms/profile/sites/${TBG.id}`, { siteAddress: 'UJI jalan tambang km 10', province: 'Kalimantan Timur', regency: 'Kutai Kartanegara', workScope: 'UJI lingkup pekerjaan', riskLevel: 'TINGGI', userDepartment: 'UJI Dept. Mining' })).status === 200, 'HO menetapkan departemen user & tingkat risiko');
const admin = (await site.get('/api/csms/profile')).data;
const rowT = admin.rows.find((r) => r.siteCode === 'TBG');
check(admin.rows.every((r) => r.siteCode === 'TBG') && rowT?.safetyOfficer && rowT.iujpNumber === 'UJI-IUJP-001' && typeof rowT.manpower === 'number', 'baris 008B TBG terisi dari sumber utama (site lain tidak tampil)', rowT && { so: rowT.safetyOfficer, mp: rowT.manpower, missing: rowT.missing });

console.log('15. Halaman Tahap 2');
for (const [who, c, path] of [['HO', ho, `/csms/findings/${fid}`], ['Site', site, `/csms/findings/${fid}`], ['HO', ho, '/csms?tab=verify&fstatus=OPEN'], ['Site', site, '/csms?tab=summary'], ['HO', ho, '/sites']]) {
  check((await c.get(path)).status === 200, `${who} ${path}`);
}

console.log('16. Assessment internal 0/1/2');
check((await site.post('/api/csms/assessments', { applicationId: appT.id, periodLabel: 'x', assessmentDate: '2026-10-29', assessors: 'x' })).status === 403, 'HSE Site tidak dapat membuat assessment');
const asm = await ho.post('/api/csms/assessments', { applicationId: appT.id, periodLabel: 'UJI Semester II 2026', assessmentDate: '2026-10-29', assessors: 'UJI Verifikator 1, UJI Verifikator 2' });
check(asm.status === 200 && asm.data.number?.startsWith('ASM-2026-'), 'HO membuat draft assessment', asm);
let ad = (await ho.get(`/api/csms/assessments/${asm.data.id}`)).data;
check(ad.scores.length === 57 && ad.scores.every((x) => x.score === null), 'nilai awal kosong untuk 57 butir (tidak otomatis)', ad.scores.length);
check(ad.totals.max <= 114 && ad.totals.unscored === ad.totals.applicable, `maksimum berlaku ${ad.totals.max} (N/A dikeluarkan)`);
check((await ho.post(`/api/csms/assessments/${asm.data.id}`, { action: 'FINALIZE' })).status === 400, 'finalisasi ditolak bila ada butir belum dinilai');
check((await site.put(`/api/csms/assessments/${asm.data.id}`, { scores: [] })).status === 403, 'HSE Site tidak dapat mengisi nilai');
check((await ho.put(`/api/csms/assessments/${asm.data.id}`, { scores: [{ itemId: ad.scores[0].itemId, score: 3 }] })).status === 400, 'nilai di luar 0–2 ditolak');
const scores = ad.scores.map((x, i) => ({ itemId: x.itemId, score: x.applicable ? (i % 5 === 0 ? 1 : 2) : null, note: i === 0 ? 'UJI: sosialisasi belum konsisten' : '' }));
check((await ho.put(`/api/csms/assessments/${asm.data.id}`, { scores })).status === 200, 'HO mengisi nilai semua butir');
const fin = await ho.post(`/api/csms/assessments/${asm.data.id}`, { action: 'FINALIZE' });
check(fin.data?.status === 'FINAL' && fin.data.totalScore > 0, `assessment final ${fin.data?.totalScore}/${fin.data?.maxScore} (${fin.data?.percent}%)`, fin);
check((await ho.put(`/api/csms/assessments/${asm.data.id}`, { scores: [{ itemId: ad.scores[0].itemId, score: 0 }] })).status === 409, 'assessment final terkunci');
const before = JSON.stringify((await ho.get(`/api/csms/assessments/${asm.data.id}`)).data.scores.map((x) => [x.score, x.evidence]));
const nextP = `2026-${String(Number(P.slice(5)) - 1).padStart(2, '0')}`;
await site.upload(`/api/csms/requirements/${rAttend.id}/evidence`, { periodKey: nextP, title: 'UJI bukti baru setelah assessment final' });
const after2 = JSON.stringify((await ho.get(`/api/csms/assessments/${asm.data.id}`)).data.scores.map((x) => [x.score, x.evidence]));
check(before === after2, 'assessment final tidak berubah saat data sumber berubah');
const fnA = await ho.post('/api/csms/findings', { siteId: TBG.id, source: 'ASSESSMENT', assessmentId: asm.data.id, requirementId: ad.scores[0].requirementId, description: 'UJI temuan assessment' });
check(fnA.status === 200, 'temuan dicatat dari assessment', fnA);
const rev = await ho.post(`/api/csms/assessments/${asm.data.id}`, { action: 'REVISE', reason: 'UJI koreksi nilai butir 1' });
check(rev.data?.number?.endsWith('-R1') && rev.data.status === 'DRAFT', 'revisi berjejak dibuat sebagai draft', rev);
check((await ho.post(`/api/csms/assessments/${asm.data.id}`, { action: 'REVISE', reason: 'lagi' })).status === 409, 'tidak boleh dua revisi draft sekaligus');
const revD = (await ho.get(`/api/csms/assessments/${rev.data.id}`)).data;
check(revD.scores.every((x) => x.score === scores.find((y) => y.itemId === x.itemId).score), 'revisi menyalin nilai versi sebelumnya');
await ho.put(`/api/csms/assessments/${rev.data.id}`, { scores: [{ itemId: revD.scores[0].itemId, score: 2 }] });
check((await ho.post(`/api/csms/assessments/${rev.data.id}`, { action: 'FINALIZE' })).data?.status === 'FINAL', 'revisi difinalkan');
const orig = (await ho.get(`/api/csms/assessments/${asm.data.id}`)).data;
check(orig.supersededAt && orig.status === 'FINAL' && orig.scores[0].score === 1, 'versi lama tetap tersimpan utuh & ditandai digantikan');
const xl = await fetch(base + `/api/csms/export?kind=assessment&id=${asm.data.id}`, { headers: { cookie: ho.cookie() } });
check(xl.status === 200 && xl.headers.get('content-type')?.includes('spreadsheet'), 'ekspor Excel assessment');
check((await hrd.get(`/api/csms/assessments/${asm.data.id}`)).status === 403, 'HRD tidak membuka assessment');

console.log('17. Izin kerja khusus');
const wpNum = 'UJI-WP-' + Date.now();
const wp = await site.post('/api/work-permits', { siteId: TBG.id, number: wpNum, permitType: 'Bekerja di Ketinggian', workType: 'UJI pemasangan atap workshop', location: 'Workshop TBG', responsibleName: 'UJI Pengawas', issuer: 'UJI Dept. HSE Owner', startAt: '2026-10-29T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z' });
check(wp.status === 200 && wp.data.status === 'TERCATAT', 'HSE Site mencatat izin kerja khusus', wp);
check((await site.post('/api/work-permits', { siteId: TBG.id, number: wpNum, permitType: 'Bekerja di Ketinggian', workType: 'x', location: 'x', responsibleName: 'x', issuer: 'x', startAt: '2026-10-29T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z' })).status === 409, 'nomor izin ganda ditolak');
check((await site.post('/api/work-permits', { siteId: TBG.id, number: wpNum + 'b', permitType: 'Izin Karangan', workType: 'x', location: 'x', responsibleName: 'x', issuer: 'x', startAt: '2026-10-29T00:00:00.000Z', endAt: '2026-10-30T00:00:00.000Z' })).status === 400, 'jenis izin di luar daftar owner ditolak');
check((await site.post(`/api/work-permits/${wp.data.id}`, { action: 'ACTIVATE' })).status === 400, 'tidak dapat direkam aktif tanpa salinan izin owner');
const wf = new FormData(); wf.set('label', 'IZIN'); wf.append('files', new Blob(['%PDF-1.4\n% UJI izin\n%%EOF\n'], { type: 'application/pdf' }), 'izin.pdf');
check((await fetch(base + `/api/work-permits/${wp.data.id}/files`, { method: 'POST', body: wf, headers: { cookie: site.cookie() } })).status === 200, 'HSE Site melampirkan salinan izin');
check((await pjo.post(`/api/work-permits/${wp.data.id}`, { action: 'ACTIVATE' })).status === 403, 'PJO tidak mengubah register izin');
check((await site.post(`/api/work-permits/${wp.data.id}`, { action: 'ACTIVATE' })).data?.status === 'AKTIF', 'izin direkam aktif');
const rWp = req('U09.02');
const srcWp = (await site.get(`/api/csms/requirements/${rWp.id}/sources?period=AWAL`)).data;
check(srcWp.groups.find((g) => g.type === 'WORK_PERMIT')?.options.some((o) => o.title.startsWith(wpNum)), 'U09.02 dapat menautkan izin dari register (bukti unsur 9)');
check((await site.post(`/api/work-permits/${wp.data.id}`, { action: 'CLOSE' })).status === 400, 'penutupan tanpa bukti/catatan ditolak');
check((await site.post(`/api/work-permits/${wp.data.id}`, { action: 'CLOSE', note: 'UJI pekerjaan selesai, area aman' })).data?.status === 'DITUTUP', 'izin ditutup dengan catatan');
check((await hrd.get('/api/work-permits')).status === 403, 'HRD tidak membuka register izin kerja');
check((await site.get('/work-permits')).status === 200 && (await site.get('/permits')).status === 200, 'halaman Izin Kerja Khusus & Permit SKS personel terpisah');

console.log('18. Ekspor Excel');
for (const q of [`kind=checklist&applicationId=${appT.id}&period=${P}`, `kind=documents&applicationId=${appT.id}&period=${P}`, `kind=recap&period=${P}`, 'kind=findings', 'kind=admin']) {
  const r = await fetch(base + '/api/csms/export?' + q, { headers: { cookie: ho.cookie() } });
  check(r.status === 200 && r.headers.get('content-disposition')?.includes('.xlsx'), 'ekspor ' + q.split('&')[0]);
}
for (const [who, c, path] of [['HO', ho, '/csms?tab=assessment'], ['Site', site, '/csms?tab=assessment'], ['HO', ho, `/csms/assessments/${asm.data.id}`], ['Site', site, `/csms/assessments/${rev.data.id}`]]) {
  check((await c.get(path)).status === 200, `${who} ${path}`);
}

console.log(failures ? `\n${failures} pemeriksaan gagal` : '\nSemua pemeriksaan lulus');
process.exit(failures ? 1 : 0);
