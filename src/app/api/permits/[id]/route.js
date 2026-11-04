import { api, formData, params } from '@/lib/http';
import { deletePermit, updatePermit } from '@/lib/services/permits';

export const DELETE = api(async (request, context, user) => deletePermit(user, (await params(context)).id));

export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updatePermit(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
