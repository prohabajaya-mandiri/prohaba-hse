import { api, json, params } from '@/lib/http';
import { assignResponsible } from '@/lib/services/sites';
export const POST = api(async (request, context, user) => assignResponsible(user, (await params(context)).id, await json(request)));
