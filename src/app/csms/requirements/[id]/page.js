import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { requirementDetail } from '@/lib/services/csms';
import RequirementDetail from './RequirementDetail';

export const metadata = { title: 'Butir CSMS' };

export default async function RequirementPage({ params, searchParams }) {
  const user = await requirePage('/csms');
  const { id } = await params;
  const { period } = (await searchParams) ?? {};
  let data;
  try {
    data = await requirementDetail(user, id, typeof period === 'string' ? period : null);
  } catch {
    redirect('/csms?tab=checklist');
  }
  const r = data.requirement;
  return (
    <AppLayout title={`Butir CSMS ${r.code}`} subtitle={`${r.application.site.code} · ${r.application.template.code} v${r.application.template.version} · unsur ${r.element.number}`} user={user}>
      <RequirementDetail data={data} />
    </AppLayout>
  );
}
