import { api, json, params } from '@/lib/http';
import { saveSite } from '@/lib/services/sites';
export const PUT = api(async (request, context, user) => saveSite(user, (await params(context)).id, await json(request)));
