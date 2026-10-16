// Tanggal bisnis disimpan sebagai tengah malam UTC (tanpa jam) agar konsisten lintas zona waktu site.
const DAY = 86400000;
export const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const today = (now) => toDate(todayIso(now));
export const toDate = (iso) => new Date(iso + 'T00:00:00Z');
export const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
export const daysBetween = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);

export function addMonths(d, n) {
  const x = new Date(d);
  const day = x.getUTCDate();
  const r = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

export const monthKey = (d) => iso(d).slice(0, 7);
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

// Minggu ISO (Senin–Minggu). weekStart 1 = Senin, 0 = Minggu (konfigurasi kalender minggu).
export function weekRange(d, weekStart = 1) {
  const x = new Date(d);
  const diff = (x.getUTCDay() - weekStart + 7) % 7;
  const start = addDays(x, -diff);
  return { start, end: addDays(start, 6) };
}

export function isoWeekKey(d) {
  const x = new Date(d);
  const thursday = addDays(x, 3 - ((x.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / DAY + 1) / 7);
  return thursday.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

export function isoWeekRange(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const start = addDays(jan4, -((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function formatDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { timeZone: 'UTC', ...opts });
}
