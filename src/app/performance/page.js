import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listActivities, listDaily, listIndicators, recap } from '@/lib/services/performance';
import PerformanceClient from './PerformanceClient';

export default async function PerformancePage({ searchParams }) {
  const user = await requirePage('/performance');
  const q = await query(searchParams);
  const tab = ['input', 'activities', 'indicators'].includes(q.tab) ? q.tab : 'recap';
  const [sites, data, activities, daily, indicators] = await Promise.all([
    scopedSites(user),
    tab === 'recap' ? recap(user, q) : null,
    tab === 'activities' ? listActivities(user, q, q) : null,
    tab === 'input' ? listDaily(user, q) : null,
    listIndicators(tab === 'indicators'),
  ]);
  return (
    <AppLayout title="HSE Performance" subtitle="Input harian, rekap mingguan/bulanan dan tren indikator" user={user}>
      <PerformanceClient tab={tab} sites={sites} data={data} activities={activities} daily={daily} indicators={indicators} page={q.page}
        canEdit={canWrite(user.role, 'performance')} canIndicator={user.role === 'HO_HSE'} />
    </AppLayout>
  );
}
