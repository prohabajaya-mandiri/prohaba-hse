import { api, json, params } from '@/lib/http';
import { requirementDetail, updateRequirement } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => requirementDetail(user, (await params(context)).id, new URL(request.url).searchParams.get('period')));
export const PUT = api(async (request, context, user) => updateRequirement(user, (await params(context)).id, await json(request)));
