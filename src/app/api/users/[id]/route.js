import { api, json, params } from '@/lib/http';
import { updateUser } from '@/lib/services/users';
export const PUT = api(async (request, context, user) => updateUser((await params(context)).id, await json(request), user));
