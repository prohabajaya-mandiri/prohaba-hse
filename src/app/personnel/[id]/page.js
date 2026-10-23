import AppLayout from '@/components/AppLayout';
import { canCorrectPlacement, canSetEmployment, canWrite } from '@/lib/access';
import { requirePage, scopedSites } from '@/lib/page';
import { getPersonnel } from '@/lib/services/personnel';
import { redirect } from 'next/navigation';
import PersonnelDetail from './PersonnelDetail';

export const metadata = { title: 'Detail Personel' };

export default async function PersonnelDetailPage({ params }) {
  const user = await requirePage('/personnel');
  const { id } = await params;
  let person;
  try {
    person = await getPersonnel(user, id);
  } catch {
    redirect('/personnel');
  }
  const sites = await scopedSites(user);
  return (
    <AppLayout title={person.name} subtitle={`${person.nip ? `NIP ${person.nip} · ` : ''}${person.position} · ${person.currentSite?.code ?? '-'}`} user={user}>
      <PersonnelDetail person={person} sites={sites} canEdit={canWrite(user.role, 'personnel')} canEmployment={canSetEmployment(user)} canRequestMutation={canWrite(user.role, 'placements')} canCorrectPlacement={canCorrectPlacement(user)} />
    </AppLayout>
  );
}
