import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { currentTab, tabLabel } from '@/lib/module-tabs';
import { alcoholDue, listAlcohol, listSessions, screening } from '@/lib/services/fit-to-work';
import FitClient from './FitClient';

export const metadata = { title: 'Fit to Work' };

export default async function FitToWorkPage({ searchParams }) {
  const user = await requirePage('/fit-to-work');
  const q = await query(searchParams);
  const tab = currentTab('/fit-to-work', q.tab, user.role);
  const [sites, sessions, screen, alcohol, due] = await Promise.all([
    scopedSites(user),
    tab === 'sessions' ? listSessions(user, q, q) : null,
    tab === 'screening' ? screening(user, q) : null,
    tab === 'alcohol' ? listAlcohol(user, q, q) : null,
    tab === 'alcohol' ? alcoholDue(user, q) : null,
  ]);
  return (
    <AppLayout title="Fit to Work" subtitle={tabLabel('/fit-to-work', tab)} user={user}>
      <FitClient tab={tab} user={user} sites={sites} sessions={sessions} screen={screen} alcohol={alcohol} due={due} page={q.page}
        canEdit={canWrite(user.role, 'fit-to-work')} canAlcohol={['HO_HSE', 'HSE_SITE'].includes(user.role)} />
    </AppLayout>
  );
}
