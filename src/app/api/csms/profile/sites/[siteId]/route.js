import { api, json, params } from '@/lib/http';
import { saveSiteProfile } from '@/lib/services/csms-profile';
export const PUT = api(async (request, context, user) => saveSiteProfile(user, (await params(context)).siteId, await json(request)));
