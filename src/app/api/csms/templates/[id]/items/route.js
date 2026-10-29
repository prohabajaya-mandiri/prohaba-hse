import { api, json, params } from '@/lib/http';
import { saveItem } from '@/lib/services/csms';
export const POST = api(async (request, context, user) => saveItem(user, (await params(context)).id, null, await json(request)));
