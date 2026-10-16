import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listAudit } from '@/lib/services/settings-admin';
import AuditClient from './AuditClient';

export const metadata = { title: 'Audit Log' };

export default async function AuditPage({ searchParams }) {
  const user = await requirePage('/audit-log');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listAudit(q, q)]);
  return (
    <AppLayout title="Audit Log" subtitle="Pelaku, waktu, data sebelum/sesudah untuk perubahan penting" user={user}>
      <AuditClient sites={sites} data={data} page={q.page} />
    </AppLayout>
  );
}
