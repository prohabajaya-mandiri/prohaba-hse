import { api, json, params } from '@/lib/http';
import { deleteResponsible, updateResponsible } from '@/lib/services/sites';
export const PUT = api(async (request, context, user) => { const p = await params(context); return updateResponsible(user, p.id, p.rid, await json(request)); });
export const DELETE = api(async (request, context, user) => { const p = await params(context); return deleteResponsible(user, p.id, p.rid); });
