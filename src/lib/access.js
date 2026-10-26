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
