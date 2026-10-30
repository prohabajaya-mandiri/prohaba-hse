import { api, formData } from '@/lib/http';
import { createInspection, listInspections } from '@/lib/services/field-safety';
export const GET = api(async (request, context, user) => listInspections(user, Object.fromEntries(new URL(request.url).searchParams)));
// multipart: data = JSON (jawaban checklist), files = foto
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createInspection(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
