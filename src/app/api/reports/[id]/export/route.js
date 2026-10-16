import { api, params } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportReport } from '@/lib/services/reports';
export const GET = api(async (request, context, user) => {
  const { buffer, name } = await exportReport(user, (await params(context)).id);
  return xlsxResponse(buffer, name);
});
