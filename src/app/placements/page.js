import AppLayout from '@/components/AppLayout';
import { canDecideMutation } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listPlacements } from '@/lib/services/placements';
import { scopedPersonnel } from '@/lib/services/common';
import PlacementsClient from './PlacementsClient';

export const metadata = { title: 'Penempatan & Mutasi' };

export default async function PlacementsPage({ searchParams }) {
  const user = await requirePage('/placements');
  const q = await query(searchParams);
  const [mySites, allSites, data, person] = await Promise.all([
    scopedSites(user),
    prisma.site.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    listPlacements(user, q, q),
    q.personnelId ? scopedPersonnel(user, String(q.personnelId), prisma, { id: true, name: true, code: true, position: true }).catch(() => null) : null,
  ]);
  return (
    <AppLayout title="Penempatan & Mutasi" subtitle="Penempatan aktif, riwayat perpindahan dan pengesahan mutasi oleh HO" user={user}>
      <PlacementsClient user={user} mySites={mySites} allSites={allSites} data={data} page={q.page} preselect={person} canDecide={canDecideMutation(user)} />
    </AppLayout>
  );
}
