'use client';

import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { Card, FilterBar, Pager, useSubmit } from '@/components/ui';

const TYPES = [['MCU_ANNUAL', 'MCU annual'], ['FOLLOW_UP', 'Follow Up'], ['PERMIT', 'Permit/SKS'], ['ROSTER', 'Roster'], ['CERTIFICATE', 'Sertifikat'], ['REPORT_DUE', 'Laporan bulanan'], ['MUTATION', 'Mutasi'], ['APPROVAL', 'Approval'], ['INCIDENT', 'Insiden'], ['DOCUMENT', 'Dokumen']];
const COLOR = { DANGER: 'var(--red-500)', WARNING: 'var(--orange-500)', INFO: 'var(--navy-500)' };

export default function NotificationsClient({ data, page }) {
  const { submit, busy } = useSubmit();
  return (
    <div className="stack">
      <FilterBar filters={[
        { name: 'unread', label: 'Tampilkan', type: 'select', allLabel: 'Semua', options: [['1', 'Belum dibaca']] },
        { name: 'type', label: 'Jenis', type: 'select', options: TYPES },
      ]}>
        <button className="btn btn-outline" disabled={busy || !data.unread} onClick={() => submit('/api/notifications', { body: { all: true } })}><CheckCheck size={16} /> Tandai semua dibaca ({data.unread})</button>
      </FilterBar>
      <Card padding={0}>
        {data.rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Tidak ada notifikasi.</div>}
        {data.rows.map((n) => (
          <div key={n.id} style={{ display: 'flex', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', background: n.readAt ? 'white' : 'var(--navy-50)', flexWrap: 'wrap' }}>
            <span style={{ width: 4, borderRadius: 4, background: COLOR[n.severity] ?? COLOR.INFO, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-900)' }}>{n.title}</div>
              <div className="muted" style={{ marginTop: 2 }}>{n.body}</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 11.5 }}>{new Date(n.createdAt).toLocaleString('id-ID')}</div>
            </div>
            <div className="row-actions" style={{ alignItems: 'center' }}>
              {n.link && <Link className="btn btn-outline btn-sm" href={n.link} onClick={() => !n.readAt && submit('/api/notifications', { body: { ids: [n.id] }, refresh: false })}>Buka</Link>}
              {!n.readAt && <button className="btn btn-ghost btn-sm" onClick={() => submit('/api/notifications', { body: { ids: [n.id] } })}>Dibaca</button>}
            </div>
          </div>
        ))}
      </Card>
      <Pager page={page} total={data.total} />
    </div>
  );
}
