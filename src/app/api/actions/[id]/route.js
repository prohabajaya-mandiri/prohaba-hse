import { api, json, params } from '@/lib/http';
import { capaTransitionAction, getCapa, updateCapa } from '@/lib/services/capa';
export const GET = api(async (request, context, user) => getCapa(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => updateCapa(user, (await params(context)).id, await json(request)));
// Transisi status: { action, note }
export const POST = api(async (request, context, user) => capaTransitionAction(user, (await params(context)).id, await json(request)));
