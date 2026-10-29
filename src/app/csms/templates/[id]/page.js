import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { canManageCsms } from '@/lib/access';
import { getTemplate } from '@/lib/services/csms';
import TemplateClient from './TemplateClient';

export const metadata = { title: 'Template CSMS' };

export default async function TemplatePage({ params }) {
  const user = await requirePage('/csms');
  if (!canManageCsms(user)) redirect('/csms');
  const { id } = await params;
  let template;
  try {
    template = await getTemplate(id);
  } catch {
    redirect('/csms?tab=setup');
  }
  return (
    <AppLayout title={`Template ${template.code} v${template.version}`} subtitle={template.name} user={user}>
      <TemplateClient template={template} />
    </AppLayout>
  );
}
