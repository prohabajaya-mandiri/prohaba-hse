import { api, formData, params } from '@/lib/http';
import { deleteActivity, updateActivity } from '@/lib/services/performance';
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateActivity(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
export const DELETE = api(async (request, context, user) => deleteActivity(user, (await params(context)).id));
