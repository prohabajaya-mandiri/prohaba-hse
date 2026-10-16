import AppLayout from '@/components/AppLayout';
import { ROLE_LABELS, siteScope } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { dashboard } from '@/lib/services/dashboard';
import { maybeRunReminders } from '@/lib/services/reminders';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }) {
  const user = await requirePage('/dashboard');
  const q = await query(searchParams);
  await maybeRunReminders();
  const [sites, data] = await Promise.all([scopedSites(user), dashboard(user, q)]);
  const allSites = siteScope(user) === null;
  return (
    <AppLayout title={allSites ? 'Dashboard Head Office' : 'Dashboard Site'} subtitle={`${ROLE_LABELS[user.role]} · ${allSites ? 'seluruh site' : sites.map((s) => s.code).join(', ') || 'tanpa site'}`} user={user}>
      <DashboardClient sites={sites} data={data} />
    </AppLayout>
  );
}
