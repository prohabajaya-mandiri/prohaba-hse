import { api } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportIncidents } from '@/lib/services/incidents';
import { todayIso } from '@/lib/dates';
export const GET = api(async (request, context, user) =>
  xlsxResponse(await exportIncidents(user, Object.fromEntries(new URL(request.url).searchParams)), `Insiden_${todayIso()}.xlsx`));
