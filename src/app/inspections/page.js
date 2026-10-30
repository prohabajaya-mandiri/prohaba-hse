import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { currentTab, tabLabel } from '@/lib/module-tabs';
import { listInspections, listTemplates, unitStatus } from '@/lib/services/field-safety';
import InspectionsClient from './InspectionsClient';

export const metadata = { title: 'Inspeksi & P2H' };

export default async function InspectionsPage({ searchParams }) {
  const user = await requirePage('/inspections');
  const q = await query(searchParams);
  const tab = currentTab('/inspections', q.tab, user.role);
  const [sites, templates, data, units] = await Promise.all([
    scopedSites(user),
    listTemplates(tab === 'templates'),
    tab === 'list' ? listInspections(user, q, q) : null,
    tab === 'units' ? unitStatus(user, q) : null,
  ]);
  return (
    <AppLayout title="Inspeksi & P2H" subtitle={tabLabel('/inspections', tab)} user={user}>
      <InspectionsClient tab={tab} sites={sites} templates={templates} data={data} units={units} page={q.page} canEdit={canWrite(user.role, 'inspections')} />
    </AppLayout>
  );
}
