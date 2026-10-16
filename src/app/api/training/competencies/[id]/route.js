import { api, json, params } from '@/lib/http';
import { saveCompetency } from '@/lib/services/training';
export const PUT = api(async (request, context, user) => saveCompetency(user, (await params(context)).id, await json(request)));
