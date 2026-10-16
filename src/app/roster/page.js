import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { listLeaves, listPolicies, rosterBoard } from '@/lib/services/roster';
import RosterClient from './RosterClient';

export const metadata = { title: 'Roster & Cuti' };

export default async function RosterPage({ searchParams }) {
  const user = await requirePage('/roster');
  const q = await query(searchParams);
  const tab = ['leaves', 'policies'].includes(q.tab) ? q.tab : 'board';
  const [sites, board, leaves, policies] = await Promise.all([
    scopedSites(user),
    tab === 'board' ? rosterBoard(user, q) : null,
    tab === 'leaves' ? listLeaves(user, q, q) : null,
    tab === 'policies' ? listPolicies() : null,
  ]);
  return (
    <AppLayout title="Roster, Cuti & Kehadiran" subtitle="Onsite/offsite, jadwal cuti, izin dan sakit" user={user}>
      <RosterClient tab={tab} sites={sites} board={board} leaves={leaves} policies={policies} page={q.page}
        canEdit={canWrite(user.role, 'roster')} canPolicy={user.role === 'HO_HSE'} preselect={q.personnelId ?? null} />
    </AppLayout>
  );
}
