import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listDocuments } from '@/lib/services/documents';
import DocumentsClient from './DocumentsClient';

export const metadata = { title: 'Dokumen HSE' };

export default async function DocumentsPage({ searchParams }) {
  const user = await requirePage('/documents');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listDocuments(user, q, q)]);
  return (
    <AppLayout title="Dokumen HSE & Compliance" subtitle="Dokumen terkontrol: nomor, revisi, masa berlaku, versi dan arsip" user={user}>
      <DocumentsClient user={user} sites={sites} data={data} page={q.page} />
    </AppLayout>
  );
}
