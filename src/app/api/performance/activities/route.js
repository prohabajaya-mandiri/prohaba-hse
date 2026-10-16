import { api, formData } from '@/lib/http';
import { createActivity, listActivities } from '@/lib/services/performance';
export const GET = api(async (request, context, user) => listActivities(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createActivity(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
