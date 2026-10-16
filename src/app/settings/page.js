import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { listSettings } from '@/lib/services/settings-admin';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const user = await requirePage('/settings');
  const settings = await listSettings();
  return (
    <AppLayout title="Parameter Sistem" subtitle="Parameter Bab 7 — wajib disetujui PJM sebelum dijadikan aturan produksi" user={user}>
      <SettingsClient settings={settings} canEdit={user.role === 'HO_HSE'} />
    </AppLayout>
  );
}
