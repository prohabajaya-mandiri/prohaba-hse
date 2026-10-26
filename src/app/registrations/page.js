import { headers } from 'next/headers';
import QRCode from 'qrcode';
import AppLayout from '@/components/AppLayout';
import { query, requirePage } from '@/lib/page';
import { listRegistrations } from '@/lib/services/registrations';
import RegistrationsClient from './RegistrationsClient';

export const metadata = { title: 'Pendaftaran Pegawai Baru' };

export default async function RegistrationsPage({ searchParams }) {
  const user = await requirePage('/registrations');
  const q = await query(searchParams);
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const link = `${h.get('x-forwarded-proto') ?? 'https'}://${host}/daftar`;
  const [data, qr] = await Promise.all([listRegistrations(user, q), QRCode.toString(link, { type: 'svg', margin: 1, width: 200 })]);
  return (
    <AppLayout title="Pendaftaran Pegawai Baru" subtitle="Verifikasi isian form publik sebelum masuk Master Data Karyawan" user={user}>
      <RegistrationsClient data={data} link={link} qr={qr} />
    </AppLayout>
  );
}
