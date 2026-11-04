import { api, json, params } from '@/lib/http';
import { correctRoster } from '@/lib/services/roster';
export const PUT = api(async (request, context, user) => correctRoster(user, (await params(context)).id, await json(request)));
