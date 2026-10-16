import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listReports } from '@/lib/services/reports';
import ReportsClient from './ReportsClient';

export default async function ReportsPage({ searchParams }) {
  const user = await requirePage('/reports');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listReports(user, q, q)]);
  return (
    <AppLayout title="Laporan HSE Site" subtitle="Draft → dikirim HSE Site → diperiksa PJO/PM → disahkan HSE HO" user={user}>
      <ReportsClient user={user} sites={sites} data={data} page={q.page} />
    </AppLayout>
  );
}
