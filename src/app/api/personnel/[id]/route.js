import { api, formData, params } from '@/lib/http';
import { getPersonnel, updatePersonnel } from '@/lib/services/personnel';

export const GET = api(async (request, context, user) => getPersonnel(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updatePersonnel(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.get('ktp') || null);
});
