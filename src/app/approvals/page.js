import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { pendingApprovals } from '@/lib/services/inbox';
import ApprovalsClient from './ApprovalsClient';

export default async function ApprovalsPage() {
  const user = await requirePage('/approvals');
  const data = await pendingApprovals(user);
  return (
    <AppLayout title="Persetujuan" subtitle="Mutasi oleh HO; laporan diperiksa PJO/PM lalu disahkan HO" user={user}>
      <ApprovalsClient data={data} />
    </AppLayout>
  );
}
