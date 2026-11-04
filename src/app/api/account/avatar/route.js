import { api, formData } from '@/lib/http';
import { removeAvatar, setAvatar } from '@/lib/services/users';
export const POST = api(async (request, context, user) => setAvatar(user, (await formData(request)).get('file')));
export const DELETE = api(async (request, context, user) => removeAvatar(user));
