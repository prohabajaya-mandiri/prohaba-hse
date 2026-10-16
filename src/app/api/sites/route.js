import { api, json } from '@/lib/http';
import { listSites, saveSite } from '@/lib/services/sites';
export const GET = api(async (request, context, user) => listSites(user));
export const POST = api(async (request, context, user) => saveSite(user, null, await json(request)));
