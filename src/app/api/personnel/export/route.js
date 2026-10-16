import { api } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { exportPersonnel } from '@/lib/services/personnel';
import { todayIso } from '@/lib/dates';
export const GET = api(async (request, context, user) =>
  xlsxResponse(await exportPersonnel(user, Object.fromEntries(new URL(request.url).searchParams)), `Personel_${todayIso()}.xlsx`));
