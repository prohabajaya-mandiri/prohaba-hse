import { api, json, params } from '@/lib/http';
import { deleteItem, saveItem } from '@/lib/services/csms';
export const PUT = api(async (request, context, user) => {
  const { id, itemId } = await params(context);
  return saveItem(user, id, itemId, await json(request));
});
export const DELETE = api(async (request, context, user) => {
  const { id, itemId } = await params(context);
  return deleteItem(user, id, itemId);
});
