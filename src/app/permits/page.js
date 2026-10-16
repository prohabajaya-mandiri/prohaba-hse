import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listPermits } from '@/lib/services/permits';
import PermitsClient from './PermitsClient';

export default async function PermitsPage({ searchParams }) {
  const user = await requirePage('/permits');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listPermits(user, q, q)]);
  return (
    <AppLayout title="Permit Kerja & SKS" subtitle="Izin dan kelayakan personel bekerja di site" user={user}>
      <PermitsClient sites={sites} data={data} page={q.page} canEdit={canWrite(user.role, 'permits')} preselect={q.personnelId ?? null} />
    </AppLayout>
  );
}
