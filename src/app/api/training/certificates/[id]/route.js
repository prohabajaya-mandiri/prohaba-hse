import { api, formData, params } from '@/lib/http';
import { deleteCertificate, saveCertificate } from '@/lib/services/training';
export const DELETE = api(async (request, context, user) => deleteCertificate(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return saveCertificate(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
