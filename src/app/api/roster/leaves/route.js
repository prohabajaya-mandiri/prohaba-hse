import { api, json } from '@/lib/http';
import { createLeave, listLeaves } from '@/lib/services/roster';
export const GET = api(async (request, context, user) => listLeaves(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createLeave(user, await json(request)));
