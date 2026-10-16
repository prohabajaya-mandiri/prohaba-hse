import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { ROLE_LABELS } from '@/lib/access';
import AccountClient from './AccountClient';

export default async function AccountPage() {
  const user = await requirePage('/account');
  return (
    <AppLayout title="Akun Saya" subtitle={ROLE_LABELS[user.role]} user={user}>
      <AccountClient user={user} />
    </AppLayout>
  );
}
