import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listPersonnel } from '@/lib/services/personnel';
import PersonnelClient from './PersonnelClient';

export const metadata = { title: 'Database Personel' };

export default async function PersonnelPage({ searchParams }) {
  const user = await requirePage('/personnel');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listPersonnel(user, q, q)]);
  return (
    <AppLayout title="Database Personel" subtitle="Data induk staff, manpower dan harian kantor" user={user}>
      <PersonnelClient sites={sites} rows={data.rows} total={data.total} page={q.page} canEdit={canWrite(user.role, 'personnel')} />
    </AppLayout>
  );
}
