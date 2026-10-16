import { api, json } from '@/lib/http';
import { createMobilization, listMobilizations } from '@/lib/services/mobilization';
export const GET = api(async (request, context, user) => listMobilizations(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createMobilization(user, await json(request)));
