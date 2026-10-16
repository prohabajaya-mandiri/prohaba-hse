import AppLayout from '@/components/AppLayout';
import { requirePage, scopedSites } from '@/lib/page';
import { listUsers } from '@/lib/services/users';
import UsersClient from './UsersClient';

export const metadata = { title: 'Pengguna' };

export default async function UsersPage() {
  const user = await requirePage('/users');
  const [users, sites] = await Promise.all([listUsers(), scopedSites(user)]);
  return (
    <AppLayout title="Pengguna & Hak Akses" subtitle="Akun, peran, cakupan site dan operator akun bersama" user={user}>
      <UsersClient users={users} sites={sites} />
    </AppLayout>
  );
}
