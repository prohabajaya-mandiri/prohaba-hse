import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listHazards } from '@/lib/services/field-safety';
import HazardsClient from './HazardsClient';

export const metadata = { title: 'Hazard Report' };

export default async function HazardsPage({ searchParams }) {
  const user = await requirePage('/hazards');
  const q = await query(searchParams);
  const [sites, data] = await Promise.all([scopedSites(user), listHazards(user, q, q)]);
  return (
    <AppLayout title="Hazard Report & Observasi" subtitle="Laporan unsafe act / unsafe condition dari lapangan, penilaian risiko dan tindak lanjut" user={user}>
      <HazardsClient user={user} sites={sites} data={data} page={q.page} canEdit={canWrite(user.role, 'hazards')} />
    </AppLayout>
  );
}
