import { api, json, params } from '@/lib/http';
import { recordResults } from '@/lib/services/training';
export const POST = api(async (request, context, user) => recordResults(user, (await params(context)).id, await json(request)));
