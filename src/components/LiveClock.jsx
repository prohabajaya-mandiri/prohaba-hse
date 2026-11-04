'use client';

import { useSyncExternalStore } from 'react';
import { zoneLabel } from '@/lib/domain/greeting';

const subscribe = (cb) => {
  const timer = setInterval(cb, 1000);
  return () => clearInterval(timer);
};
const seconds = () => Math.floor(Date.now() / 1000);

/** Waktu perangkat, diperbarui tiap detik. null saat render server agar tidak terjadi hydration mismatch. */
export function useNow() {
  const value = useSyncExternalStore(subscribe, seconds, () => null);
  return value === null ? null : new Date(value * 1000);
}

const pad = (n) => String(n).padStart(2, '0');

export default function LiveClock({ now, className = '' }) {
  return (
    <div className={`live-clock ${className}`.trim()}>
      <div className="live-clock-time">
        <span>{now ? pad(now.getHours()) : '--'}</span>
        <i aria-hidden>:</i>
        <span>{now ? pad(now.getMinutes()) : '--'}</span>
        <small>{now ? pad(now.getSeconds()) : '--'}</small>
        {now && <em>{zoneLabel(now)}</em>}
      </div>
      <div className="live-clock-date">
        <strong>{now ? now.toLocaleDateString('id-ID', { weekday: 'long' }) : ' '}</strong>
        {now ? now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
      </div>
    </div>
  );
}
