import { api, json, params } from '@/lib/http';
import { deleteMobilization, updateMobilization } from '@/lib/services/mobilization';
export const PUT = api(async (request, context, user) => updateMobilization(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteMobilization(user, (await params(context)).id));
