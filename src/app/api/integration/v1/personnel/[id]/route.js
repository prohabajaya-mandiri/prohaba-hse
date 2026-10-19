import { formData, params } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { getPersonnel, updatePersonnel } from '@/lib/services/personnel';

export const GET = integrationApi(async (request, context, user) => getPersonnel(user, (await params(context)).id));
export const PUT = integrationApi(async (request, context, user) => {
  const form = await formData(request);
  return updatePersonnel(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.get('ktp') || null);
});
