import { api, json } from '@/lib/http';
import { listSessions, saveSession } from '@/lib/services/training';
export const GET = api(async (request, context, user) => listSessions(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveSession(user, null, await json(request)));
