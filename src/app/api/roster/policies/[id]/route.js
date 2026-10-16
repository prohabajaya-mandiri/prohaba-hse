import { api, json, params } from '@/lib/http';
import { savePolicy } from '@/lib/services/roster';
export const PUT = api(async (request, context, user) => savePolicy(user, (await params(context)).id, await json(request)));
