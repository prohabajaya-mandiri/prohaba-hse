import { api, formData, params } from '@/lib/http';
import { updateSession } from '@/lib/services/fit-to-work';
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateSession(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
