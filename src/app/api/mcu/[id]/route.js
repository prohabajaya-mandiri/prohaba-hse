import { api, formData, params } from '@/lib/http';
import { deleteMcu, updateMcu } from '@/lib/services/mcu';

export const DELETE = api(async (request, context, user) => deleteMcu(user, (await params(context)).id));

export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateMcu(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
