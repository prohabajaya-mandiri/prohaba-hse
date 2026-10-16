import { api, json } from '@/lib/http';
import { listPolicies, savePolicy } from '@/lib/services/roster';
export const GET = api(async () => listPolicies());
export const POST = api(async (request, context, user) => savePolicy(user, null, await json(request)));
