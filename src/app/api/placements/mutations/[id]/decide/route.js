import { api, json, params } from '@/lib/http';
import { decideMutation } from '@/lib/services/placements';
export const POST = api(async (request, context, user) => decideMutation(user, (await params(context)).id, await json(request)));
