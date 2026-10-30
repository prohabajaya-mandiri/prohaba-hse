import { api, formData } from '@/lib/http';
import { createHazard, listHazards } from '@/lib/services/field-safety';
export const GET = api(async (request, context, user) => listHazards(user, Object.fromEntries(new URL(request.url).searchParams)));
// multipart: data = JSON, files = foto temuan
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createHazard(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
