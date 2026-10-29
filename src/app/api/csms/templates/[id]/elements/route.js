import { api, json, params } from '@/lib/http';
import { saveElement } from '@/lib/services/csms';
import { optionalId } from '@/lib/validation';
// POST tanpa elementId = unsur baru; dengan elementId = ubah unsur.
export const POST = api(async (request, context, user) => {
  const { elementId, ...body } = await json(request);
  return saveElement(user, (await params(context)).id, optionalId(elementId, 'Unsur'), body);
});
