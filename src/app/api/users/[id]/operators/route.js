import { api, json, params } from '@/lib/http';
import { saveOperator } from '@/lib/services/users';
export const POST = api(async (request, context, user) => saveOperator((await params(context)).id, await json(request), user));
