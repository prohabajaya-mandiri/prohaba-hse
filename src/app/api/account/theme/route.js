import { api, json } from '@/lib/http';
import { setTheme } from '@/lib/services/users';
export const PUT = api(async (request, context, user) => setTheme(user, await json(request)));
