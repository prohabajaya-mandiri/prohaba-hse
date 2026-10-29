'use client';

import { Badge } from '@/components/ui';
import { FREQUENCY_LABELS } from '@/lib/domain/csms';
import { labelOf } from '@/lib/labels';

// Label status alur CSMS (istilah spesifikasi: "Diajukan", bukan "Dikirim" seperti laporan).
export const CSMS_STATUS = {
  BELUM: 'Belum diisi', DRAFT: 'Draft', SUBMITTED: 'Diajukan', REVIEWED: 'Diperiksa PJO/PM', REVISION: 'Perlu revisi', VERIFIED: 'Terverifikasi',
  NA: 'N/A', NA_PENDING: 'Usulan N/A', APPLICABLE: 'Berlaku',
};
export const RESP_LABELS = { HO: 'HO', SITE: 'Site', BERSAMA: 'Bersama' };
export const FREQ_OPTIONS = Object.entries(FREQUENCY_LABELS);
export const STATUS_OPTIONS = ['BELUM', 'DRAFT', 'SUBMITTED', 'REVIEWED', 'REVISION', 'VERIFIED'].map((s) => [s, CSMS_STATUS[s]]);

export function StatusBadge({ value }) {
  return <Badge value={value} label={CSMS_STATUS[value] ?? labelOf(value)} />;
}

export function Flags({ flags }) {
  if (!flags?.length) return null;
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{flags.map((f) => <Badge key={f} value={f} />)}</div>;
}

/** Kelengkapan terverifikasi: tanpa butir berlaku tampil "—", bukan 100%. */
export function Percent({ summary, big = false }) {
  if (!summary || summary.percent === null) return <span className="muted">{big ? 'Belum ada persyaratan' : '—'}</span>;
  return (
    <div style={{ minWidth: big ? 200 : 110 }}>
      <div style={{ fontWeight: 600, fontSize: big ? 26 : 14 }}>{summary.percent.toLocaleString('id-ID')}%</div>
      <div className="progress-bar-wrap" style={{ marginTop: 4 }}><div className={`progress-bar-fill ${summary.percent >= 100 ? 'green' : 'navy'}`} style={{ width: `${Math.min(100, summary.percent)}%` }} /></div>
      <div className="muted" style={{ fontSize: 12 }}>{summary.verified} dari {summary.applicable} butir berlaku terverifikasi</div>
    </div>
  );
}

export const picLabel = (r) => [r.picRole ? labelOf(r.picRole) : null, r.picName].filter(Boolean).join(' · ') || '—';
export const freqLabel = (f) => FREQUENCY_LABELS[f] ?? f;
