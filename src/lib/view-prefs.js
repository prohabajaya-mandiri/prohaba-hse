// Ukuran tampilan per perangkat; skrip awal di layout.js memasangnya sebelum halaman tampil.
export const ZOOM_STEPS = [90, 100, 110, 125, 150];

function save(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function setZoom(percent) {
  const root = document.documentElement;
  root.style.setProperty('--ui-zoom', percent / 100);
  root.dataset.zoom = percent;
  save('ui-zoom', percent);
}

export function setFit(on) {
  const root = document.documentElement;
  if (on) root.dataset.fit = '1';
  else delete root.dataset.fit;
  save('ui-fit', on ? '1' : '');
}
