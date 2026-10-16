import { api, formData } from '@/lib/http';
import { createIncident, listIncidents } from '@/lib/services/incidents';
export const GET = api(async (request, context, user) => listIncidents(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createIncident(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
