import { api, formData } from '@/lib/http';
import { createPermit, listPermits } from '@/lib/services/permits';

export const GET = api(async (request, context, user) => listPermits(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createPermit(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
