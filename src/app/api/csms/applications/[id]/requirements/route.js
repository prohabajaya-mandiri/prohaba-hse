import { api, json, params } from '@/lib/http';
import { addSiteRequirement } from '@/lib/services/csms';
export const POST = api(async (request, context, user) => addSiteRequirement(user, (await params(context)).id, await json(request)));
