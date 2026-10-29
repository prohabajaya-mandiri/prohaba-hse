import { api, json } from '@/lib/http';
import { importBuiltinTemplate, listTemplates } from '@/lib/services/csms';
import { InputError, object } from '@/lib/validation';
export const GET = api(async () => ({ rows: await listTemplates() }));
// Template baru dibuat dari transkripsi bawaan atau salinan template lain (POST /templates/:id action COPY).
export const POST = api(async (request, context, user) => {
  const body = object(await json(request), ['builtin']);
  if (!body.builtin) throw new InputError('Pilih template bawaan yang akan dimuat.');
  return importBuiltinTemplate(user, String(body.builtin));
});
