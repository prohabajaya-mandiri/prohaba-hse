import { api, formData, params } from '@/lib/http';
import { uploadWorkPermitFiles } from '@/lib/services/work-permits';
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return uploadWorkPermitFiles(user, (await params(context)).id, String(form.get('label') ?? ''), form.getAll('files'));
});
