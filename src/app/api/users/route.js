import { api, json } from '@/lib/http';
import { createUser, listUsers } from '@/lib/services/users';
export const GET = api(async () => listUsers());
export const POST = api(async (request, context, user) => createUser(await json(request), user));
