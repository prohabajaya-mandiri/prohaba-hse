import { api } from '@/lib/http';
import { listAudit } from '@/lib/services/settings-admin';
export const GET = api(async (request) => {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  return listAudit(sp, { skip: (page - 1) * 50, take: 50 });
});
