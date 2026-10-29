import { api, json, params } from '@/lib/http';
import { linkSource, requirementSources } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => {
  const sp = new URL(request.url).searchParams;
  return requirementSources(user, (await params(context)).id, { periodKey: sp.get('period'), types: sp.get('types') });
});
export const POST = api(async (request, context, user) => linkSource(user, (await params(context)).id, await json(request)));
