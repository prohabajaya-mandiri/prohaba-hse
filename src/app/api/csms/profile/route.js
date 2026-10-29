import { api, json } from '@/lib/http';
import { administrationRows, saveCompanyProfile } from '@/lib/services/csms-profile';
export const GET = api(async (request, context, user) => administrationRows(user));
export const PUT = api(async (request, context, user) => saveCompanyProfile(user, await json(request)));
