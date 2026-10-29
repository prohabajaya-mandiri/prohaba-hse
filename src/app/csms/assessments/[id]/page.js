import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { getAssessment } from '@/lib/services/csms-assessment';
import AssessmentDetail from './AssessmentDetail';

export const metadata = { title: 'Assessment CSMS' };

export default async function AssessmentPage({ params }) {
  const user = await requirePage('/csms');
  const { id } = await params;
  let a;
  try {
    a = await getAssessment(user, id);
  } catch {
    redirect('/csms?tab=assessment');
  }
  return (
    <AppLayout title={`Assessment ${a.number}`} subtitle={`${a.site.code} · ${a.template.code} v${a.template.version} · ${a.status === 'FINAL' ? 'Final' : 'Draft'}`} user={user}>
      <AssessmentDetail a={a} />
    </AppLayout>
  );
}
