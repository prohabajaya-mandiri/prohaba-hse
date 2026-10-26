import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { TIMEZONE } from '@/lib/dates';
import { getRegistration } from '@/lib/services/registrations';
import RegistrationReview from './RegistrationReview';

export const metadata = { title: 'Verifikasi Pendaftaran' };

export default async function RegistrationPage({ params }) {
  const user = await requirePage('/registrations');
  const { id } = await params;
  let reg;
  try {
    reg = await getRegistration(user, id);
  } catch {
    redirect('/registrations');
  }
  return (
    <AppLayout title={`Verifikasi ${reg.number}`} subtitle={`${reg.name} · masuk ${new Date(reg.createdAt).toLocaleString('id-ID', { timeZone: TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`} user={user}>
      <RegistrationReview reg={reg} />
    </AppLayout>
  );
}
