import { api, formData, params } from '@/lib/http';
import { updateDocument } from '@/lib/services/documents';
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateDocument(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.get('file') || null);
});
