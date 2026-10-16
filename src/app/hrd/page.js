import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { hrBoard, listScenarios } from '@/lib/services/hrd';
import HrdClient from './HrdClient';

export default async function HrdPage({ searchParams }) {
  const user = await requirePage('/hrd');
  const q = await query(searchParams);
  const [sites, board, scenarios] = await Promise.all([scopedSites(user), hrBoard(user, q), listScenarios()]);
  return (
    <AppLayout title="Monitoring HRD & Efisiensi SDM" subtitle="Rekomendasi status personel dan simulasi biaya (bukan aturan payroll)" user={user}>
      <HrdClient sites={sites} board={board} scenarios={scenarios} />
    </AppLayout>
  );
}
