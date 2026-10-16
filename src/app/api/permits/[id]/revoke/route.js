import { api, json, params } from '@/lib/http';
import { revokePermit } from '@/lib/services/permits';
export const POST = api(async (request, context, user) => revokePermit(user, (await params(context)).id, await json(request)));
