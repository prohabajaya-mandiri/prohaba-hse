import { api, json } from '@/lib/http';
import { updateProfile } from '@/lib/services/users';
export const PUT = api(async (request, context, user) => updateProfile(user, await json(request)));
