import { api, json, params } from '@/lib/http';
import { saveTemplate } from '@/lib/services/field-safety';
export const PUT = api(async (request, context, user) => saveTemplate(user, (await params(context)).id, await json(request)));
