import { api, json, params } from '@/lib/http';
import { saveProject } from '@/lib/services/sites';
export const POST = api(async (request, context, user) => saveProject(user, (await params(context)).id, await json(request)));
