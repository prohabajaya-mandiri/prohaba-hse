import { api, json } from '@/lib/http';
import { listWorkPermits, saveWorkPermit } from '@/lib/services/work-permits';
export const GET = api(async (request, context, user) => listWorkPermits(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveWorkPermit(user, null, await json(request)));
