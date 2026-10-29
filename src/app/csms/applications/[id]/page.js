import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { canManageCsms } from '@/lib/access';
import { getApplication } from '@/lib/services/csms';
import ApplicationClient from './ApplicationClient';

export const metadata = { title: 'Persyaratan CSMS Site' };

export default async function ApplicationPage({ params }) {
  const user = await requirePage('/csms');
  if (!canManageCsms(user)) redirect('/csms?tab=checklist');
  const { id } = await params;
  let app;
  try {
    app = await getApplication(user, id);
  } catch {
    redirect('/csms?tab=setup');
  }
  return (
    <AppLayout title={`Persyaratan CSMS ${app.site.code}`} subtitle={`${app.template.code} v${app.template.version} · ${app.template.ownerName}`} user={user}>
      <ApplicationClient app={app} />
    </AppLayout>
  );
}
