import { api, json, params } from '@/lib/http';
import { setWorkStatus } from '@/lib/services/personnel';
export const POST = api(async (request, context, user) => setWorkStatus(user, (await params(context)).id, await json(request)));
