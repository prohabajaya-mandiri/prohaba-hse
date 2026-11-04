'use client';

import { useState } from 'react';
import { Badge, DataTable, FileLinks, FilterBar, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '@/lib/domain/support';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

export default function HelpClient({ data, page }) {
  const { submit, busy } = useSubmit();
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');
  const detail = data.rows.find((r) => r.id === openId) ?? null;

  const open = (r) => { setReply(''); setOpenId(r.id); };
  const sendReply = async (e) => {
    e.preventDefault();
    if (await submit(`/api/support/${detail.id}`, { body: { message: reply } })) setReply('');
  };
  const setStatus = (status) => submit(`/api/support/${detail.id}`, { method: 'PUT', body: { status } });

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Aduan baru" value={data.counts.BARU ?? 0} tone="red" />
        <Kpi label="Sedang diproses" value={data.counts.DIPROSES ?? 0} tone="yellow" />
        <Kpi label="Selesai" value={data.counts.SELESAI ?? 0} tone="green" />
      </div>
      <FilterBar filters={[
        { name: 'status', label: 'Status', type: 'select', options: SUPPORT_STATUSES },
        { name: 'category', label: 'Kategori', type: 'select', options: SUPPORT_CATEGORIES },
      ]} />
      <div className="card">
        <DataTable rows={data.rows} onRowClick={open} empty="Belum ada aduan masuk."
          columns={[
            { key: 'number', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.createdAt)}</div></div>) },
            { key: 'from', label: 'Pengirim', render: (r) => (<div>{r.createdByName}<div className="muted">{r.createdByRole}{r.siteCodes ? ' · ' + r.siteCodes : ''}</div></div>) },
            { key: 'category', label: 'Kategori', render: (r) => labelOf(r.category) },
            { key: 'message', label: 'Pesan', render: (r) => (r.message.length > 90 ? r.message.slice(0, 90) + '…' : r.message) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setOpenId(null)} title={detail ? `Aduan ${detail.number}` : ''} subtitle={detail ? `${detail.createdByName} · ${detail.createdByRole}${detail.siteCodes ? ' · ' + detail.siteCodes : ''}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>Kategori</dt><dd>{labelOf(detail.category)}</dd></div>
              <div><dt>Status</dt><dd><Badge value={detail.status} /></dd></div>
              <div><dt>Dikirim</dt><dd>{formatDate(detail.createdAt)}</dd></div>
              <div><dt>Halaman</dt><dd>{detail.page ?? '-'}</dd></div>
            </dl>
            <p style={{ whiteSpace: 'pre-wrap' }}>{detail.message}</p>
            {detail.files.length > 0 && <FileLinks files={detail.files} />}
            {detail.replies.map((r) => <div key={r.id} className={`support-reply ${r.fromHo ? 'ho' : ''}`}><strong>{r.authorName}</strong> {r.message}</div>)}
            <form onSubmit={sendReply} className="support-reply-form">
              <input className="form-input" required maxLength={3000} placeholder="Tulis balasan" aria-label="Balasan" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={busy}>Kirim</button>
            </form>
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              {detail.status !== 'DIPROSES' && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setStatus('DIPROSES')}>Tandai diproses</button>}
              {detail.status !== 'SELESAI' && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setStatus('SELESAI')}>Tandai selesai</button>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
