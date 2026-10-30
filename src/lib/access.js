// Matriks hak akses E-HSE. Fungsi di sini murni (tanpa database) agar dapat diuji.
export const ROLES = ['HO_HSE', 'HSE_SITE', 'HRD', 'PJO', 'PM', 'DIREKSI'];
export const ROLE_LABELS = {
  HO_HSE: 'HO HSE',
  HSE_SITE: 'HSE Site',
  HRD: 'HRD HO',
  PJO: 'PJO',
  PM: 'Project Manager',
  DIREKSI: 'Direksi',
};
// Peran dengan visibilitas lintas site. Peran lain dibatasi site/wilayah yang ditugaskan.
export const ALL_SITE_ROLES = ['HO_HSE', 'HRD', 'DIREKSI'];
const ALL = ROLES;

export const MODULES = {
  dashboard: { read: ALL },
  account: { read: ALL, write: ALL },
  notifications: { read: ALL, write: ALL },
  approvals: { read: ALL, write: ALL },
  files: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD'] },
  sites: { read: ALL, write: ['HO_HSE'] },
  personnel: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD'] },
  // Verifikasi pendaftaran mandiri pegawai baru (form publik /daftar).
  registrations: { read: ['HO_HSE', 'HRD'], write: ['HO_HSE', 'HRD'] },
  // write = pengajuan mutasi/penempatan; pengesahan mutasi hanya HO_HSE (lihat canDecideMutation).
  placements: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD', 'PJO', 'PM'] },
  mcu: { read: ALL, write: ['HO_HSE', 'HSE_SITE'] },
  permits: { read: ALL, write: ['HO_HSE', 'HSE_SITE'] },
  mobilization: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD'] },
  roster: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD'] },
  performance: { read: ALL, write: ['HO_HSE', 'HSE_SITE'] },
  // transisi laporan per peran dicek di reportTransition.
  reports: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'] },
  incidents: { read: ALL, write: ['HO_HSE', 'HSE_SITE'] },
  training: { read: ALL, write: ['HO_HSE', 'HSE_SITE', 'HRD'] },
  hrd: { read: ['HRD', 'DIREKSI'], write: ['HRD', 'DIREKSI'] },
  documents: { read: ALL, write: ['HO_HSE', 'HSE_SITE'] },
  // CSMS: HRD hanya membaca butir yang PIC-nya HRD; PJO/PM menulis untuk pemeriksaan saja
  // (aksi per peran dicek di csmsTransition dan service).
  csms: { read: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI', 'HRD'], write: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'] },
  // Izin kerja khusus dari owner (aktivitas), terpisah dari Permit & SKS personel.
  'work-permits': { read: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI'], write: ['HO_HSE', 'HSE_SITE'] },
  // Lapangan: PJO/PM ikut melapor bahaya, inspeksi & mengerjakan tindakan korektif. Penutupan CAPA dicek di capaTransition.
  hazards: { read: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI'], write: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'] },
  inspections: { read: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI'], write: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'] },
  actions: { read: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM', 'DIREKSI'], write: ['HO_HSE', 'HSE_SITE', 'PJO', 'PM'] },
  settings: { read: ['HO_HSE', 'DIREKSI', 'HRD'], write: ['HO_HSE'] },
  users: { read: ['HO_HSE'], write: ['HO_HSE'] },
  'audit-log': { read: ['HO_HSE', 'DIREKSI'] },
};

export function moduleOf(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'api' ? parts[1] : parts[0];
}

export function canAccess(role, pathname, method = 'GET') {
  const rules = MODULES[moduleOf(pathname)];
  if (!rules || !ROLES.includes(role)) return false;
  const list = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? rules.read : rules.write;
  return Boolean(list?.includes(role));
}

export const canWrite = (role, moduleName) => Boolean(MODULES[moduleName]?.write?.includes(role));

export function isSameOriginMutation(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const url = new URL(request.url);
  // Next.js may use an internal hostname in request.url behind a reverse proxy.
  const host = request.headers.get('host') ?? url.host;
  const protocol = process.env.VERCEL ? 'https:' : url.protocol;
  return origin === `${protocol}//${host}`;
}

// ─── Cakupan site ────────────────────────────────────────────────────────────
// null = seluruh site; array = hanya site tersebut (bisa kosong = tidak ada akses data site).
export function siteScope(user) {
  if (!user) return [];
  if (ALL_SITE_ROLES.includes(user.role)) return null;
  return Array.isArray(user.siteIds) ? user.siteIds : [];
}

export function canSeeSite(user, siteId) {
  const scope = siteScope(user);
  return scope === null || (siteId != null && scope.includes(siteId));
}

export function siteWhere(user, field = 'siteId') {
  const scope = siteScope(user);
  return scope === null ? {} : { [field]: { in: scope } };
}

/** Filter site dari query string, selalu dipotong dengan cakupan pengguna. */
export function siteFilter(user, siteId, field = 'siteId') {
  const scope = siteScope(user);
  if (siteId) return { [field]: scope === null || scope.includes(siteId) ? siteId : '__none__' };
  return siteWhere(user, field);
}

// ─── Data sensitif ───────────────────────────────────────────────────────────
// KTP: NIK lengkap, alamat KTP, file KTP. MEDICAL: catatan & dokumen MCU, riwayat penyakit.
// BANK: rekening. SALARY: diatur matriks Setting "access.salary" (default di settings.js).
const SENSITIVE = {
  KTP: ['HO_HSE', 'HRD', 'HSE_SITE'],
  MEDICAL: ['HO_HSE', 'HSE_SITE'],
  BANK: ['HRD'],
  HR: ['HRD', 'DIREKSI'],
};

export function canSeeSensitive(user, kind, siteId, salaryMatrix) {
  if (!user) return false;
  if (kind === 'SALARY') return Boolean(salaryMatrix?.view?.includes(user.role));
  if (kind === 'GENERAL') return siteId === undefined || siteId === null || canSeeSite(user, siteId);
  if (!SENSITIVE[kind]?.includes(user.role)) return false;
  // Data sensitif hanya untuk site dalam cakupan (HSE Site tidak melihat site lain).
  return siteId === undefined || siteId === null ? siteScope(user) === null : canSeeSite(user, siteId);
}

export const canEditSalary = (user, salaryMatrix) => Boolean(salaryMatrix?.edit?.includes(user?.role));
export const canDecideMutation = (user) => user?.role === 'HO_HSE';
// Koreksi tanggal pada riwayat penempatan mengubah masa kerja: hanya HO HSE.
export const canCorrectPlacement = (user) => user?.role === 'HO_HSE';
export const canManageMaster = (user) => user?.role === 'HO_HSE';
// Status kepegawaian (PKWT/PKWTT) & akhir kontrak menyangkut hubungan kerja: hanya HRD dan HO HSE.
export const EMPLOYMENT_ROLES = ['HRD', 'HO_HSE'];
export const canSetEmployment = (user) => EMPLOYMENT_ROLES.includes(user?.role);

// ─── Alur laporan HSE: Draft → dikirim HSE Site → diperiksa PJO/PM → disahkan HO ──
const REPORT_TRANSITIONS = {
  SUBMIT: { from: ['DRAFT', 'REVISION'], to: 'SUBMITTED', roles: ['HSE_SITE'] },
  REVIEW: { from: ['SUBMITTED'], to: 'REVIEWED', roles: ['PJO', 'PM'] },
  RETURN_REVIEW: { from: ['SUBMITTED'], to: 'REVISION', roles: ['PJO', 'PM'] },
  APPROVE: { from: ['REVIEWED'], to: 'APPROVED', roles: ['HO_HSE'] },
  RETURN_APPROVE: { from: ['REVIEWED'], to: 'REVISION', roles: ['HO_HSE'] },
};

export function reportTransition(role, action, status) {
  const rule = Object.hasOwn(REPORT_TRANSITIONS, action) ? REPORT_TRANSITIONS[action] : null;
  if (!rule || !rule.roles.includes(role) || !rule.from.includes(status)) return null;
  return rule;
}

// ─── Alur CSMS: Site menyiapkan → mengajukan → (PJO/PM bila diwajibkan) → verifikasi HO ──
// Verifikasi HO = verifikasi internal PJM, bukan persetujuan owner. BELUM = belum ada catatan.
const CSMS_TRANSITIONS = {
  SAVE: { from: ['BELUM', 'DRAFT', 'REVISION'], to: 'DRAFT', roles: () => ['HSE_SITE', 'HO_HSE'] },
  SUBMIT: { from: ['BELUM', 'DRAFT', 'REVISION'], to: 'SUBMITTED', roles: () => ['HSE_SITE', 'HO_HSE'] },
  // Bukti terverifikasi yang diubah wajib diperiksa ulang: kembali ke Draft, riwayat tetap.
  REVISE: { from: ['VERIFIED'], to: 'DRAFT', roles: () => ['HSE_SITE', 'HO_HSE'] },
  REVIEW: { from: ['SUBMITTED'], to: 'REVIEWED', roles: (review) => (review ? ['PJO', 'PM'] : []) },
  RETURN: { from: ['SUBMITTED', 'REVIEWED'], to: 'REVISION', note: true, roles: (review, status) => (status === 'REVIEWED' || !review ? ['HO_HSE'] : ['PJO', 'PM']) },
  VERIFY: { from: ['SUBMITTED', 'REVIEWED'], to: 'VERIFIED', roles: (review, status) => (status === 'REVIEWED' || !review ? ['HO_HSE'] : []) },
  REOPEN: { from: ['VERIFIED'], to: 'REVISION', note: true, roles: () => ['HO_HSE'] },
};

export function csmsTransition(role, action, status, requireReview = false) {
  const rule = Object.hasOwn(CSMS_TRANSITIONS, action) ? CSMS_TRANSITIONS[action] : null;
  if (!rule || !rule.from.includes(status) || !rule.roles(Boolean(requireReview), status).includes(role)) return null;
  return { action, to: rule.to, noteRequired: Boolean(rule.note) };
}

/** Aksi yang tersedia untuk peran pada status tertentu (untuk tombol utama sesuai langkah berikutnya). */
export const csmsActions = (role, status, requireReview) =>
  Object.keys(CSMS_TRANSITIONS).filter((a) => csmsTransition(role, a, status, requireReview));

// Standar CSMS (template, penerapan, persyaratan site, N/A) hanya dikelola HO HSE.
export const canManageCsms = (user) => user?.role === 'HO_HSE';

// ─── Temuan CSMS: Terbuka → Dalam proses → Diajukan untuk penutupan → Ditutup ──
// Unggahan bukti tidak menutup temuan; penutupan & pembukaan kembali hanya verifikator HO.
const FINDING_TRANSITIONS = {
  START: { from: ['TERBUKA'], to: 'DALAM_PROSES', roles: ['HSE_SITE', 'HO_HSE'] },
  SUBMIT_CLOSE: { from: ['TERBUKA', 'DALAM_PROSES'], to: 'DIAJUKAN_TUTUP', roles: ['HSE_SITE', 'HO_HSE'] },
  RETURN: { from: ['DIAJUKAN_TUTUP'], to: 'DALAM_PROSES', roles: ['HO_HSE'], note: true },
  CLOSE: { from: ['DIAJUKAN_TUTUP'], to: 'DITUTUP', roles: ['HO_HSE'] },
  REOPEN: { from: ['DITUTUP'], to: 'DALAM_PROSES', roles: ['HO_HSE'], note: true },
};

export function findingTransition(role, action, status) {
  const rule = Object.hasOwn(FINDING_TRANSITIONS, action) ? FINDING_TRANSITIONS[action] : null;
  if (!rule || !rule.from.includes(status) || !rule.roles.includes(role)) return null;
  return { action, to: rule.to, noteRequired: Boolean(rule.note) };
}

export const findingActions = (role, status) => Object.keys(FINDING_TRANSITIONS).filter((a) => findingTransition(role, a, status));
