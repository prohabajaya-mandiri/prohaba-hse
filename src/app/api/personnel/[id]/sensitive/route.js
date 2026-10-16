import { api, params } from '@/lib/http';
import { revealSensitive } from '@/lib/services/personnel';
export const GET = api(async (request, context, user) =>
  revealSensitive(user, (await params(context)).id, new URL(request.url).searchParams.get('kind')));
