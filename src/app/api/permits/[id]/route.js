import { api, formData, params } from '@/lib/http';
import { updatePermit } from '@/lib/services/permits';

export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updatePermit(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
