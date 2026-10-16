import { api, formData } from '@/lib/http';
import { listCertificates, saveCertificate } from '@/lib/services/training';
export const GET = api(async (request, context, user) => listCertificates(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return saveCertificate(user, null, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
