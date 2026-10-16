import { api } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportRecap } from '@/lib/services/performance';
import { todayIso } from '@/lib/dates';
export const GET = api(async (request, context, user) =>
  xlsxResponse(await exportRecap(user, Object.fromEntries(new URL(request.url).searchParams)), `Rekap_HSE_Performance_${todayIso()}.xlsx`));
