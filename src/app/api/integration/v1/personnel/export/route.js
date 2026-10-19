import { todayIso } from '@/lib/dates';
import { xlsxResponse } from '@/lib/files';
import { integrationApi } from '@/lib/integration';
import { exportPersonnel } from '@/lib/services/personnel';

export const GET = integrationApi(async (request, context, user) =>
  xlsxResponse(await exportPersonnel(user, Object.fromEntries(new URL(request.url).searchParams)), `Karyawan_${todayIso()}.xlsx`));
