import AppLayout from '@/components/AppLayout';
import { canSetEmployment, canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listPersonnel } from '@/lib/services/personnel';
import PersonnelClient from './PersonnelClient';

export const metadata = { title: 'Master Data Karyawan' };

export default async function PersonnelPage({ searchParams }) {
  const user = await requirePage('/personnel');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listPersonnel(user, q, q)]);
  return (
    <AppLayout title="Master Data Karyawan" subtitle="Data induk staff, harian kantor dan harian mandor — dipakai juga oleh ERP Center" user={user}>
      <PersonnelClient sites={sites} rows={data.rows} total={data.total} page={q.page} canEdit={canWrite(user.role, 'personnel')} canEmployment={canSetEmployment(user)} />
    </AppLayout>
  );
}
