import { api, json, params } from '@/lib/http';
import { confirmArrival } from '@/lib/services/mobilization';
export const POST = api(async (request, context, user) => confirmArrival(user, (await params(context)).id, await json(request)));
