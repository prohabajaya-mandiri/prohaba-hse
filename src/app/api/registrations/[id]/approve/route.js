import { api, json, params } from '@/lib/http';
import { approveRegistration } from '@/lib/services/registrations';

export const POST = api(async (request, context, user) => approveRegistration(user, (await params(context)).id, await json(request)));
