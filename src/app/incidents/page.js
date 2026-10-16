import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { incidentSettings, listIncidents } from '@/lib/services/incidents';
import IncidentsClient from './IncidentsClient';

export const metadata = { title: 'Insiden' };

export default async function IncidentsPage({ searchParams }) {
  const user = await requirePage('/incidents');
  const q = await query(searchParams);
  const [sites, data, cfg] = await Promise.all([scopedSites(user), listIncidents(user, q, q), incidentSettings()]);
  return (
    <AppLayout title="Insiden & Kecelakaan Kerja" subtitle="Pencatatan, investigasi, tindakan korektif/pencegahan dan penutupan" user={user}>
      <IncidentsClient sites={sites} data={data} cfg={cfg} page={q.page} canEdit={canWrite(user.role, 'incidents')} />
    </AppLayout>
  );
}
