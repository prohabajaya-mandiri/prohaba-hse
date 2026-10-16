import { api, json, params } from '@/lib/http';
import { saveSetting } from '@/lib/services/settings-admin';
export const PUT = api(async (request, context, user) => saveSetting(user, (await params(context)).key, await json(request)));
