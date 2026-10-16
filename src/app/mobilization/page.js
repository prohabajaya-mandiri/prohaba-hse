import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listMobilizations } from '@/lib/services/mobilization';
import MobilizationClient from './MobilizationClient';

export default async function MobilizationPage({ searchParams }) {
  const user = await requirePage('/mobilization');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listMobilizations(user, q, { skip: (q.page - 1) * 30, take: 30 })]);
  return (
    <AppLayout title="Mobilisasi & Demobilisasi" subtitle="Kloter, perjalanan, kedatangan dan kepulangan" user={user}>
      <MobilizationClient user={user} sites={sites} data={data} page={q.page} canEdit={canWrite(user.role, 'mobilization')} />
    </AppLayout>
  );
}
