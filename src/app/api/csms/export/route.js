import { api } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportCsms } from '@/lib/services/csms-export';
export const GET = api(async (request, context, user) => {
  const { buffer, fileName } = await exportCsms(user, Object.fromEntries(new URL(request.url).searchParams));
  return xlsxResponse(buffer, fileName);
});
