import { api, json, params } from '@/lib/http';
import { closeHazard } from '@/lib/services/field-safety';
export const POST = api(async (request, context, user) => closeHazard(user, (await params(context)).id, await json(request)));
