import { api, json } from '@/lib/http';
import { listDaily, saveDaily } from '@/lib/services/performance';
export const GET = api(async (request, context, user) => listDaily(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveDaily(user, await json(request)));
