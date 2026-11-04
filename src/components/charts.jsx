'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Grafik "liquid glass": cincin tipis dan batang kapsul dengan rincian angka yang bisa
// langsung dibaca. Warna utama memakai token tema agar mengikuti pilihan warna akun.

/** Id gradien SVG yang aman dari nama seri (mis. "Harian Mandor"). */
const gradId = (prefix, key) => `${prefix}-${String(key).replace(/[^a-z0-9]/gi, '')}`;

const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);

/** Cincin dengan rincian di sampingnya; menyorot baris menyorot potongan yang sama, dan sebaliknya. */
export function DonutBreakdown({ prefix, data, colors, centerLabel, hrefOf, format = String }) {
  const [active, setActive] = useState(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const focused = data.find((d) => d.key === active);
  const rows = [...data].sort((a, b) => b.value - a.value);
  const colorOf = (key) => colors[key] ?? 'var(--gray-400)';

  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {data.map((d) => (
                <linearGradient key={d.key} id={gradId(prefix, d.key)} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${colorOf(d.key)} 72%, white)` }} />
                  <stop offset="100%" style={{ stopColor: colorOf(d.key) }} />
                </linearGradient>
              ))}
            </defs>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="78%" outerRadius="100%" startAngle={90} endAngle={-270}
              paddingAngle={data.length > 1 ? 3 : 0} minAngle={6} cornerRadius={7} stroke="none"
              onMouseEnter={(_, i) => setActive(data[i]?.key ?? null)} onMouseLeave={() => setActive(null)}>
              {data.map((d) => <Cell key={d.key} fill={`url(#${gradId(prefix, d.key)})`} fillOpacity={active && active !== d.key ? 0.25 : 1} style={{ transition: 'fill-opacity .18s ease', outline: 'none' }} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{format(focused?.value ?? total)}</strong>
          <span>{focused ? `${focused.name} · ${percent(focused.value, total)}%` : centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {rows.map((d) => {
          const body = (
            <>
              <span className="donut-row-head">
                <span className="donut-dot" style={{ background: colorOf(d.key) }} />
                <span className="donut-name">{d.name}</span>
                <strong>{format(d.value)}</strong>
                <span className="donut-pct">{percent(d.value, total)}%</span>
              </span>
              <span className="donut-track"><span style={{ width: `${percent(d.value, total)}%`, background: colorOf(d.key) }} /></span>
            </>
          );
          const href = hrefOf?.(d);
          const hover = { onMouseEnter: () => setActive(d.key), onMouseLeave: () => setActive(null) };
          return <li key={d.key}>{href ? <Link href={href} className="donut-row" {...hover}>{body}</Link> : <div className="donut-row" {...hover}>{body}</div>}</li>;
        })}
      </ul>
    </div>
  );
}

export function SeriesLegend({ series, colors }) {
  return <div className="series-legend">{series.map((k) => <span key={k}><i style={{ background: colors[k] }} />{k}</span>)}</div>;
}

/** Peringkat per site: batang kapsul bertumpuk, terbesar di atas; site kosong diringkas satu baris. */
export function SiteBars({ rows, series, colors, hrefOf, format = String }) {
  const totals = rows.map((r) => ({ ...r, total: series.reduce((a, k) => a + (r.values[k] ?? 0), 0) }));
  const filled = totals.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const empty = totals.filter((r) => r.total === 0);
  const max = filled[0]?.total ?? 1;
  return (
    <div className="site-bars">
      {filled.map((r) => (
        <Link key={r.key} href={hrefOf(r)} className="site-bar-row" title={`${r.label}: ${series.map((k) => `${k} ${r.values[k] ?? 0}`).join(' · ')}`}>
          <span className="site-bar-code">{r.label}</span>
          <span className="site-bar-track">
            <span className="site-bar-fill" style={{ width: `${Math.max((r.total / max) * 100, 4)}%` }}>
              {series.map((k) => (r.values[k] > 0 ? <span key={k} style={{ flexGrow: r.values[k], background: colors[k] }} /> : null))}
            </span>
          </span>
          <strong>{format(r.total)}</strong>
        </Link>
      ))}
      {filled.length === 0 && <div className="muted">Belum ada personel.</div>}
      {empty.length > 0 && filled.length > 0 && <div className="site-bars-empty">Belum ada personel: {empty.map((r) => r.label).join(', ')}</div>}
    </div>
  );
}
