import { api, formData, params } from '@/lib/http';
import { updateIncident } from '@/lib/services/incidents';
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateIncident(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
