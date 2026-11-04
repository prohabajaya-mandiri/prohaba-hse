import { api, json, params } from '@/lib/http';
import { deleteUser, updateUser } from '@/lib/services/users';
export const PUT = api(async (request, context, user) => updateUser((await params(context)).id, await json(request), user));
export const DELETE = api(async (request, context, user) => deleteUser((await params(context)).id, user));
