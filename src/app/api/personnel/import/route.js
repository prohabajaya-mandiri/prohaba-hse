import { api, json } from '@/lib/http';
import { importCommit, importPreview } from '@/lib/services/personnel';
import { choice, object } from '@/lib/validation';

export const POST = api(async (request, context, user) => {
  const body = object(await json(request), ['mode', 'rows']);
  return choice(body.mode, ['preview', 'commit'], 'Mode') === 'preview' ? importPreview(user, body.rows) : importCommit(user, body.rows);
});
