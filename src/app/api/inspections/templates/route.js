import { api, json } from '@/lib/http';
import { listTemplates, saveTemplate } from '@/lib/services/field-safety';
export const GET = api(async () => listTemplates(true));
export const POST = api(async (request, context, user) => saveTemplate(user, null, await json(request)));
