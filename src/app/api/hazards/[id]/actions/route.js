import { api, json, params } from '@/lib/http';
import { followUpHazard } from '@/lib/services/field-safety';
export const POST = api(async (request, context, user) => followUpHazard(user, (await params(context)).id, await json(request)));
