import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listCapa, otherOpenActions } from '@/lib/services/capa';
import ActionsClient from './ActionsClient';

export const metadata = { title: 'Tindakan Korektif' };

export default async function ActionsPage({ searchParams }) {
  const user = await requirePage('/actions');
  const q = await query(searchParams);
  const [sites, data, others] = await Promise.all([scopedSites(user), listCapa(user, { status: 'OPEN', ...q }, q), otherOpenActions(user)]);
  return (
    <AppLayout title="Tindakan Korektif" subtitle="Register CAPA dari hazard report, inspeksi/P2H, audit & manual — PIC, tenggat dan verifikasi penutupan" user={user}>
      <ActionsClient sites={sites} data={data} others={others} page={q.page} canCreate={['HO_HSE', 'HSE_SITE'].includes(user.role)} />
    </AppLayout>
  );
}
