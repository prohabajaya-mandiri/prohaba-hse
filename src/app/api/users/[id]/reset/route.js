import { api, params } from '@/lib/http';
import { resetPassword } from '@/lib/services/users';
export const POST = api(async (request, context, user) => resetPassword((await params(context)).id, user));
