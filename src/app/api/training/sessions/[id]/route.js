import { api, json, params } from '@/lib/http';
import { saveSession } from '@/lib/services/training';
export const PUT = api(async (request, context, user) => saveSession(user, (await params(context)).id, await json(request)));
