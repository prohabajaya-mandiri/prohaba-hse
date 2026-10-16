'use client';

import { useState } from 'react';
import { DataTable, FilterBar, Modal, Pager } from '@/components/ui';

const MODULES = ['users', 'account', 'sites', 'personnel', 'placements', 'mcu', 'permits', 'mobilization', 'roster', 'performance', 'reports', 'incidents', 'training', 'hrd', 'documents', 'settings', 'files'];
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'IMPORT', 'EXPORT', 'VIEW_SENSITIVE'];

export default function AuditClient({ sites, data, page }) {
  const [detail, setDetail] = useState(null);
  const siteCode = Object.fromEntries(sites.map((s) => [s.id, s.code]));
  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Pelaku / catatan' },
        { name: 'module', label: 'Modul', type: 'select', options: MODULES.map((m) => [m, m]) },
        { name: 'action', label: 'Aksi', type: 'select', options: ACTIONS.map((a) => [a, a]) },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]} />
      <div className="card">
        <DataTable rows={data.rows} onRowClick={setDetail} empty="Belum ada log."
          columns={[
            { key: 'at', label: 'Waktu', render: (r) => new Date(r.createdAt).toLocaleString('id-ID') },
            { key: 'actorName', label: 'Pelaku' },
            { key: 'action', label: 'Aksi', render: (r) => <span className={`badge ${r.action === 'VIEW_SENSITIVE' ? 'badge-warning' : r.action === 'DELETE' ? 'badge-danger' : 'badge-gray'}`}>{r.action}</span> },
            { key: 'module', label: 'Modul' },
            { key: 'site', label: 'Site', render: (r) => siteCode[r.siteId] ?? '-' },
            { key: 'note', label: 'Keterangan', render: (r) => <span className="muted">{r.note ?? (r.after ? Object.keys(r.after).slice(0, 4).join(', ') : '-')}</span> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.action} · ${detail.module}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>Pelaku</dt><dd>{detail.actorName}</dd></div>
              <div><dt>Waktu</dt><dd>{new Date(detail.createdAt).toLocaleString('id-ID')}</dd></div>
              <div><dt>Record</dt><dd><code>{detail.recordId ?? '-'}</code></dd></div>
              <div><dt>Catatan</dt><dd>{detail.note ?? '-'}</dd></div>
            </dl>
            <div className="grid-2">
              <div><div className="section-title">Sebelum</div><pre style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.before, null, 2) ?? '-'}</pre></div>
              <div><div className="section-title">Sesudah</div><pre style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.after, null, 2) ?? '-'}</pre></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
