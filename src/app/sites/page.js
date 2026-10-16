import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { listSites } from '@/lib/services/sites';
import { canManageMaster } from '@/lib/access';
import SitesClient from './SitesClient';

export default async function SitesPage() {
  const user = await requirePage('/sites');
  const sites = await listSites(user);
  return (
    <AppLayout title="Master Site & Proyek" subtitle="Referensi site, proyek, owner dan penanggung jawab" user={user}>
      <SitesClient sites={sites} canEdit={canManageMaster(user)} />
    </AppLayout>
  );
}
