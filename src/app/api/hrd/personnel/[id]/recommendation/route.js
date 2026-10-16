import { api, json, params } from '@/lib/http';
import { saveRecommendation } from '@/lib/services/hrd';
export const POST = api(async (request, context, user) => saveRecommendation(user, (await params(context)).id, await json(request)));
