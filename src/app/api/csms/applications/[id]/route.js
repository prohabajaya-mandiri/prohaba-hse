import { api, json, params } from '@/lib/http';
import { getApplication, updateApplication } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => getApplication(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => updateApplication(user, (await params(context)).id, await json(request)));
