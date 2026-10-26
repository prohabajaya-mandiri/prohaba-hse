import { api, json, params } from '@/lib/http';
import { rejectRegistration } from '@/lib/services/registrations';

export const POST = api(async (request, context, user) => rejectRegistration(user, (await params(context)).id, await json(request)));
