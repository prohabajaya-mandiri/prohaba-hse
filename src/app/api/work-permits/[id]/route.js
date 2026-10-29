import { api, json, params } from '@/lib/http';
import { saveWorkPermit, workPermitAction } from '@/lib/services/work-permits';
export const PUT = api(async (request, context, user) => saveWorkPermit(user, (await params(context)).id, await json(request)));
// ACTIVATE | CLOSE | CANCEL
export const POST = api(async (request, context, user) => workPermitAction(user, (await params(context)).id, await json(request)));
