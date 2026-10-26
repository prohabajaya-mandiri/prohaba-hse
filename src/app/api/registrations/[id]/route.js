import { api, params } from '@/lib/http';
import { getRegistration } from '@/lib/services/registrations';

export const GET = api(async (request, context, user) => getRegistration(user, (await params(context)).id));
