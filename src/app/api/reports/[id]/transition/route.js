import { api, json, params } from '@/lib/http';
import { transitionReport } from '@/lib/services/reports';
export const POST = api(async (request, context, user) => transitionReport(user, (await params(context)).id, await json(request)));
