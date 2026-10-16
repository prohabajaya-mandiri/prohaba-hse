import { api, formData, params } from '@/lib/http';
import { saveCertificate } from '@/lib/services/training';
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return saveCertificate(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
