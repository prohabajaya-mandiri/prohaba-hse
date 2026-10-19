import { json } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { importCommit, importPreview } from '@/lib/services/personnel';
import { choice, object } from '@/lib/validation';

export const POST = integrationApi(async (request, context, user) => {
  const body = object(await json(request), ['mode', 'rows']);
  return choice(body.mode, ['preview', 'commit'], 'Mode') === 'preview' ? importPreview(user, body.rows) : importCommit(user, body.rows);
});
