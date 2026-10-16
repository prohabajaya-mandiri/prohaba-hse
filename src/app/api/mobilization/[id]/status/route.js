import { api, json, params } from '@/lib/http';
import { setMobilizationStatus } from '@/lib/services/mobilization';
export const POST = api(async (request, context, user) => setMobilizationStatus(user, (await params(context)).id, await json(request)));
