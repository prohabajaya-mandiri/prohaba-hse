import { api, json } from '@/lib/http';
import { changeOwnPassword } from '@/lib/services/users';
export const POST = api(async (request, context, user) => changeOwnPassword(user, await json(request)));
