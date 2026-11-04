'use client';

import { useSyncExternalStore } from 'react';
import { AArrowDown, AArrowUp, Maximize2, Minimize2 } from 'lucide-react';
import { setFit, setZoom, ZOOM_STEPS } from '@/lib/view-prefs';

const subscribe = (cb) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-zoom', 'data-fit'] });
  return () => mo.disconnect();
};
const readZoom = () => Number(document.documentElement.dataset.zoom) || 100;
const readFit = () => document.documentElement.dataset.fit === '1';

export default function ViewTools({ className = '' }) {
  const zoom = useSyncExternalStore(subscribe, readZoom, () => 100);
  const fit = useSyncExternalStore(subscribe, readFit, () => false);
  const at = ZOOM_STEPS.indexOf(zoom);
  return (
    <div className={`view-tools ${className}`.trim()} role="group" aria-label="Pengaturan tampilan">
      <button type="button" className="header-btn" title="Perkecil huruf" aria-label="Perkecil huruf" disabled={at <= 0} onClick={() => setZoom(ZOOM_STEPS[at - 1])}><AArrowDown size={20} /></button>
      <button type="button" className="view-tools-reset" title="Kembali ke ukuran normal" aria-label={`Ukuran ${zoom} persen, kembali ke normal`} onClick={() => setZoom(100)}>{zoom}%</button>
      <button type="button" className="header-btn" title="Perbesar huruf" aria-label="Perbesar huruf" disabled={at === ZOOM_STEPS.length - 1} onClick={() => setZoom(ZOOM_STEPS[at + 1])}><AArrowUp size={20} /></button>
      <button type="button" className="header-btn view-tools-fit" title={fit ? 'Tampilkan menu samping' : 'Paskan layar'} aria-label={fit ? 'Tampilkan menu samping' : 'Paskan layar'} aria-pressed={fit} onClick={() => setFit(!fit)}>
        {fit ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
      </button>
    </div>
  );
}
