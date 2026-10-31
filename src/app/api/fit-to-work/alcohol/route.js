import { api, formData } from '@/lib/http';
import { createAlcohol, listAlcohol } from '@/lib/services/fit-to-work';
export const GET = api(async (request, context, user) => listAlcohol(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createAlcohol(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
