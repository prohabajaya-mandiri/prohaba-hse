import { api, json, params } from '@/lib/http';
import { endPlacement } from '@/lib/services/placements';
import { requireWrite } from '@/lib/services/common';
export const POST = api(async (request, context, user) => {
  requireWrite(user, 'mobilization');
  return endPlacement(user, (await params(context)).id, await json(request));
});
