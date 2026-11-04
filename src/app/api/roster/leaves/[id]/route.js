import { api, json, params } from '@/lib/http';
import { deleteLeave, updateLeave } from '@/lib/services/roster';
export const POST = api(async (request, context, user) => updateLeave(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteLeave(user, (await params(context)).id));
