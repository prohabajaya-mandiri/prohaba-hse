import { api, json, params } from '@/lib/http';
import { saveAction } from '@/lib/services/incidents';
export const POST = api(async (request, context, user) => saveAction(user, (await params(context)).id, await json(request)));
