import { api, json, params } from '@/lib/http';
import { saveDocumentCsms } from '@/lib/services/csms';
export const PUT = api(async (request, context, user) => saveDocumentCsms(user, (await params(context)).id, await json(request)));
