// Warna tema per akun. Hanya pilihan yang tetap terbaca dengan teks putih pada tombol.
export const DEFAULT_THEME = 'hijau';
export const THEME_COLORS = [
  { key: 'hijau', label: 'Hijau K3', color: '#086840' },
  { key: 'tosca', label: 'Tosca', color: '#0f766e' },
  { key: 'biru', label: 'Biru Laut', color: '#1d5fa8' },
  { key: 'indigo', label: 'Indigo', color: '#4338ca' },
  { key: 'ungu', label: 'Ungu', color: '#7e3aa8' },
  { key: 'marun', label: 'Marun', color: '#9f2141' },
  { key: 'oranye', label: 'Oranye', color: '#b9520f' },
  { key: 'abu', label: 'Abu Baja', color: '#475569' },
];
export const THEME_KEYS = THEME_COLORS.map((t) => t.key);
