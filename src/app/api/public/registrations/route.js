import { clientIp, formData, publicApi } from '@/lib/http';
import { submitRegistration } from '@/lib/services/registrations';

// Form pendaftaran pegawai baru (tanpa login). multipart: field form + ktp (foto KTP).
export const POST = publicApi(async (request) => submitRegistration(await formData(request), { ip: clientIp(request) }));
