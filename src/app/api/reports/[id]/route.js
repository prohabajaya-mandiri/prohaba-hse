import { api, formData, params } from '@/lib/http';
import { getReport, updateReport } from '@/lib/services/reports';
export const GET = api(async (request, context, user) => getReport(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => {
  const form = await formData(request);
  return updateReport(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
