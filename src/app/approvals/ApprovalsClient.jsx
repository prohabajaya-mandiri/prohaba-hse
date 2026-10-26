'use client';

import Link from 'next/link';
import { Card, DataTable } from '@/components/ui';
import { formatDate } from '@/lib/dates';

const KIND = { REGISTRATION: 'Pendaftaran', MUTATION: 'Mutasi', REPORT: 'Laporan', INDICATOR: 'Indikator', SETTING: 'Parameter', MY_REQUEST: 'Pengajuan saya' };

export default function ApprovalsClient({ data }) {
  return (
    <div className="stack">
      <Card title={`Menunggu tindakan (${data.items.length})`} padding={0}>
        <DataTable rows={data.items} rowKey={(i) => i.kind + i.id} empty="Tidak ada yang menunggu tindakan."
          columns={[
            { key: 'kind', label: 'Jenis', render: (i) => <span className="chip">{KIND[i.kind]}</span> },
            { key: 'title', label: 'Perihal', render: (i) => (<div><strong>{i.title}</strong><div className="muted">{i.detail}</div></div>) },
            { key: 'since', label: 'Sejak', render: (i) => formatDate(i.since) },
            { key: 'a', label: '', render: (i) => <Link className="btn btn-primary btn-sm" href={i.link}>Tinjau</Link> },
          ]} />
      </Card>
      <Card title="Riwayat keputusan" padding={0}>
        <DataTable rows={data.history} empty="Belum ada riwayat."
          columns={[
            { key: 'at', label: 'Waktu', render: (h) => new Date(h.createdAt).toLocaleString('id-ID') },
            { key: 'entityType', label: 'Proses', render: (h) => KIND[h.entityType] ?? h.entityType },
            { key: 'step', label: 'Langkah' },
            { key: 'decision', label: 'Keputusan' },
            { key: 'actorName', label: 'Oleh' },
            { key: 'note', label: 'Alasan / catatan', render: (h) => h.note ?? '-' },
          ]} />
      </Card>
    </div>
  );
}
