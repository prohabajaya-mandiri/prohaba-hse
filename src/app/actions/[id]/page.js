import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { getCapa } from '@/lib/services/capa';
import { labelOf } from '@/lib/labels';
import ActionDetail from './ActionDetail';

export const metadata = { title: 'Tindakan Korektif' };

export default async function ActionPage({ params }) {
  const user = await requirePage('/actions');
  const { id } = await params;
  let capa;
  try {
    capa = await getCapa(user, id);
  } catch {
    redirect('/actions');
  }
  return (
    <AppLayout title={`Tindakan ${capa.number}`} subtitle={`${capa.site.code} · ${labelOf(capa.sourceType)}${capa.sourceRef ? ' ' + capa.sourceRef : ''} · ${labelOf(capa.status)}`} user={user}>
      <ActionDetail capa={capa} />
    </AppLayout>
  );
}
