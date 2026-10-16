import { api, json } from '@/lib/http';
import { requestMutation } from '@/lib/services/placements';
export const POST = api(async (request, context, user) => requestMutation(user, await json(request)));
