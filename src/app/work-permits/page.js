import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/lib/settings';
import { listWorkPermits } from '@/lib/services/work-permits';
import WorkPermitsClient from './WorkPermitsClient';

export const metadata = { title: 'Izin Kerja Khusus' };

export default async function WorkPermitsPage({ searchParams }) {
  const user = await requirePage('/work-permits');
  const q = await query(searchParams);
  const [sites, data, types, projects] = await Promise.all([
    scopedSites(user, { activeOnly: true }),
    listWorkPermits(user, q, q),
    getSetting('workPermit.types'),
    prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, siteId: true, name: true, owner: true } }),
  ]);
  return (
    <AppLayout title="Izin Kerja Khusus" subtitle="Register izin kerja dari owner untuk pekerjaan berisiko (bukan permit/SKS personel)" user={user}>
      <WorkPermitsClient sites={sites} data={data} types={types} projects={projects} page={q.page} canEdit={canWrite(user.role, 'work-permits')} />
    </AppLayout>
  );
}
