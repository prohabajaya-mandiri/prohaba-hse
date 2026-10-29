import { api, json, params } from '@/lib/http';
import { activateTemplate, copyTemplate, deleteDraftTemplate, getTemplate, updateTemplate } from '@/lib/services/csms';
import { choice } from '@/lib/validation';
export const GET = api(async (request, context) => getTemplate((await params(context)).id));
export const PUT = api(async (request, context, user) => updateTemplate(user, (await params(context)).id, await json(request)));
export const POST = api(async (request, context, user) => {
  const { id } = await params(context);
  const { action, ...body } = await json(request);
  return choice(action, ['COPY', 'ACTIVATE'], 'Aksi') === 'COPY' ? copyTemplate(user, id, body) : activateTemplate(user, id);
});
export const DELETE = api(async (request, context, user) => deleteDraftTemplate(user, (await params(context)).id));
