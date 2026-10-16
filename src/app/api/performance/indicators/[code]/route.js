import { api, json, params } from '@/lib/http';
import { saveIndicator } from '@/lib/services/performance';
export const PUT = api(async (request, context, user) => saveIndicator(user, (await params(context)).code, await json(request)));
