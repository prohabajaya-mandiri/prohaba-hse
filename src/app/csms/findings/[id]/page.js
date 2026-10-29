import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { getFinding } from '@/lib/services/csms-findings';
import { labelOf } from '@/lib/labels';
import FindingDetail from './FindingDetail';

export const metadata = { title: 'Temuan CSMS' };

export default async function FindingPage({ params }) {
  const user = await requirePage('/csms');
  const { id } = await params;
  let finding;
  try {
    finding = await getFinding(user, id);
  } catch {
    redirect('/csms?tab=verify');
  }
  return (
    <AppLayout title={`Temuan ${finding.number}`} subtitle={`${finding.site.code} · ${labelOf(finding.source)} · ${labelOf(finding.status)}`} user={user}>
      <FindingDetail finding={finding} />
    </AppLayout>
  );
}
