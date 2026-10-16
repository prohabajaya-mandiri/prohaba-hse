import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listMcu } from '@/lib/services/mcu';
import McuClient from './McuClient';

export const metadata = { title: 'Medical Check Up' };

export default async function McuPage({ searchParams }) {
  const user = await requirePage('/mcu');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listMcu(user, q, q)]);
  return (
    <AppLayout title="Medical Check Up" subtitle="Alur screening → MCU → hasil → feedback → Follow Up → mobilisasi" user={user}>
      <McuClient sites={sites} data={data} page={q.page} canEdit={canWrite(user.role, 'mcu')} preselect={q.personnelId ?? null} />
    </AppLayout>
  );
}
