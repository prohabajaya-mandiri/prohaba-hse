import { api, json, params } from '@/lib/http';
import { updatePlacement } from '@/lib/services/placements';
import { requireWrite } from '@/lib/services/common';
export const PATCH = api(async (request, context, user) => {
  requireWrite(user, 'placements');
  return updatePlacement(user, (await params(context)).id, await json(request));
});
