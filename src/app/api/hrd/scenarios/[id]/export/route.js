import { api, params } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportSimulation } from '@/lib/services/hrd';
import { todayIso } from '@/lib/dates';
export const GET = api(async (request, context, user) =>
  xlsxResponse(await exportSimulation(user, (await params(context)).id, Object.fromEntries(new URL(request.url).searchParams)), `Simulasi_Efisiensi_${todayIso()}.xlsx`));
