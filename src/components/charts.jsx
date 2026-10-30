'use client';

import { Rectangle } from 'recharts';

// Gaya grafik "liquid glass": isi bergradien tembus pandang dengan tepi berkilau,
// tooltip/legenda kaca, dan sumbu tipis. Warna teks memakai token tema agar terbaca
// di mode terang maupun gelap.

/** Id gradien SVG yang aman dari nama seri (mis. "Harian Mandor"). */
export const gradId = (prefix, key) => `${prefix}-${String(key).replace(/[^a-z0-9]/gi, '')}`;

/** <defs> gradien: kilau terang di atas → warna penuh di bawah, sedikit tembus. */
export function GlassGradients({ prefix, colors }) {
  return (
    <defs>
      {Object.entries(colors).map(([key, color]) => (
        <linearGradient key={key} id={gradId(prefix, key)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${color} 55%, white)`, stopOpacity: 0.9 }} />
          <stop offset="55%" style={{ stopColor: color, stopOpacity: 0.88 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.96 }} />
        </linearGradient>
      ))}
    </defs>
  );
}

export const glassTooltip = {
  contentStyle: {
    background: 'var(--glass-bg-strong)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    backdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--glass-border)',
    borderRadius: 14,
    boxShadow: 'var(--glass-highlight), var(--glass-shadow)',
    padding: '10px 14px',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--gray-900)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--gray-700)', padding: '1px 0' },
  cursor: { fill: 'var(--glass-bg-soft)', radius: 10 },
  wrapperStyle: { outline: 'none' },
};

export const glassLegend = {
  iconType: 'circle',
  iconSize: 9,
  wrapperStyle: { fontSize: 13, paddingTop: 10 },
  formatter: (value) => <span style={{ color: 'var(--gray-700)', marginRight: 6 }}>{value}</span>,
};

export const glassAxis = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11.5, fill: 'var(--gray-500)' },
};

export const glassGrid = { stroke: 'var(--glass-edge)', strokeDasharray: '4 6', vertical: false };

/** Tepi kaca untuk potongan donut/batang. */
export const glassStroke = { stroke: 'var(--glass-border)', strokeWidth: 1 };

/**
 * Bentuk batang bertumpuk: hanya segmen teratas yang tidak nol yang dibulatkan,
 * sehingga tiap batang terlihat seperti satu kapsul kaca.
 */
export const stackedBarShape = (key, order) => function StackedBar(props) {
  const top = [...order].reverse().find((k) => (props.payload?.[k] ?? 0) > 0);
  return <Rectangle {...props} radius={top === key ? [10, 10, 0, 0] : 0} />;
};

/** Angka di lubang donut. */
export function DonutCenter({ value, label }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ textAlign: 'center', marginTop: -28 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{label}</div>
      </div>
    </div>
  );
}
