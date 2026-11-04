import { DEFAULT_THEME } from './domain/profile.js';

// Warna tema tersimpan di akun; localStorage hanya salinan agar tidak berkedip saat halaman dimuat.
export function applyAccent(key) {
  const root = document.documentElement;
  if (key && key !== DEFAULT_THEME) root.dataset.accent = key;
  else delete root.dataset.accent;
  try { localStorage.setItem('accent', key || ''); } catch {}
}
