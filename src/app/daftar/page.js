import { connection } from 'next/server';
import { publicSites } from '@/lib/services/registrations';
import DaftarClient from './DaftarClient';

export const metadata = { title: 'Pendaftaran Pegawai Baru' };

export default async function DaftarPage() {
  // Daftar site dibaca per permintaan agar site baru/nonaktif langsung berlaku.
  await connection();
  const sites = await publicSites();
  return <DaftarClient sites={sites} />;
}
