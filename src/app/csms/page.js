import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { currentTab, tabLabel } from '@/lib/module-tabs';
import { builtinTemplates, checklist, listApplications, listTemplates, masterDocuments, overview, projectOptions, reviewQueue, templateItemOptions } from '@/lib/services/csms';
import CsmsClient from './CsmsClient';

export const metadata = { title: 'CSMS' };

export default async function CsmsPage({ searchParams }) {
  const user = await requirePage('/csms');
  const q = await query(searchParams);
  const tab = currentTab('/csms', q.tab, user.role);
  const isHo = user.role === 'HO_HSE';
  const [sites, data] = await Promise.all([
    scopedSites(user, { activeOnly: true }),
    tab === 'summary' ? overview(user, q)
      : tab === 'checklist' ? checklist(user, q)
        : tab === 'documents' ? Promise.all([masterDocuments(user, q), isHo ? templateItemOptions() : []]).then(([docs, items]) => ({ ...docs, items }))
          : tab === 'verify' ? reviewQueue(user, q)
            : Promise.all([listTemplates(), listApplications(user, { status: 'all' }), builtinTemplates(), projectOptions()]).then(([templates, apps, builtins, projects]) => ({ templates, apps, builtins, projects })),
  ]);
  return (
    <AppLayout title="CSMS" subtitle={tabLabel('/csms', tab)} user={user}>
      <CsmsClient tab={tab} user={user} sites={sites} data={data} page={q.page} />
    </AppLayout>
  );
}
