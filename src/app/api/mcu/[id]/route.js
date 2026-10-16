import { api, formData, params } from '@/lib/http';
import { updateMcu } from '@/lib/services/mcu';

export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateMcu(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
