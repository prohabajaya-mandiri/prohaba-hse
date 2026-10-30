import { api, json } from '@/lib/http';
import { createCapa, listCapa } from '@/lib/services/capa';
export const GET = api(async (request, context, user) => listCapa(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createCapa(user, await json(request)));
