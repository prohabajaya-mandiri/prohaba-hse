import AppLayout from '@/components/AppLayout';
import { query, requirePage, scopedSites } from '@/lib/page';
import { currentTab, tabLabel } from '@/lib/module-tabs';
import { builtinTemplates, checklist, listApplications, listTemplates, masterDocuments, overview, projectOptions, reviewQueue, templateItemOptions } from '@/lib/services/csms';
import { listFindings } from '@/lib/services/csms-findings';
import { administrationRows, getCompanyProfile } from '@/lib/services/csms-profile';
import CsmsClient from './CsmsClient';

export const metadata = { title: 'CSMS' };

export default async function CsmsPage({ searchParams }) {
  const user = await requirePage('/csms');
  const q = await query(searchParams);
  const tab = currentTab('/csms', q.tab, user.role);
  const isHo = user.role === 'HO_HSE';
  const [sites, data] = await Promise.all([
    scopedSites(user, { activeOnly: true }),
    tab === 'summary' ? Promise.all([overview(user, q), administrationRows(user), listFindings(user, { fstatus: 'OPEN', siteId: q.siteId }, { take: 1 })]).then(([o, admin, f]) => ({ ...o, admin, findingsOpen: f.total }))
      : tab === 'checklist' ? checklist(user, q)
        : tab === 'documents' ? Promise.all([masterDocuments(user, q), isHo ? templateItemOptions() : []]).then(([docs, items]) => ({ ...docs, items }))
          : tab === 'verify' ? Promise.all([reviewQueue(user, q), listFindings(user, q, { skip: 0, take: 100 })]).then(([queue, findings]) => ({ ...queue, findings }))
            : Promise.all([listTemplates(), listApplications(user, { status: 'all' }), builtinTemplates(), projectOptions(), getCompanyProfile()]).then(([templates, apps, builtins, projects, company]) => ({ templates, apps, builtins, projects, company })),
  ]);
  return (
    <AppLayout title="CSMS" subtitle={tabLabel('/csms', tab)} user={user}>
      <CsmsClient tab={tab} user={user} sites={sites} data={data} page={q.page} />
    </AppLayout>
  );
}
