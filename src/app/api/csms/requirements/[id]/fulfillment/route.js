import { api, json, params } from '@/lib/http';
import { transition } from '@/lib/services/csms';
export const POST = api(async (request, context, user) => transition(user, (await params(context)).id, await json(request)));
