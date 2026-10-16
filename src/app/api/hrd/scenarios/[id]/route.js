import { api, json, params } from '@/lib/http';
import { saveScenario } from '@/lib/services/hrd';
export const PUT = api(async (request, context, user) => saveScenario(user, (await params(context)).id, await json(request)));
