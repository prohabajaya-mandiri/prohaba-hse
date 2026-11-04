import AppLayout from '@/components/AppLayout';
import { query, requirePage } from '@/lib/page';
import { listTickets } from '@/lib/services/support';
import HelpClient from './HelpClient';

export const metadata = { title: 'Pusat Bantuan & Komunikasi' };

export default async function HelpPage({ searchParams }) {
  const user = await requirePage('/help');
  const q = await query(searchParams);
  const data = await listTickets(q, q);
  return (
    <AppLayout title="Pusat Bantuan & Komunikasi" subtitle="Laporan, kendala, dan informasi penting terkait aplikasi maupun pekerjaan" user={user}>
      <HelpClient data={data} page={q.page} />
    </AppLayout>
  );
}
