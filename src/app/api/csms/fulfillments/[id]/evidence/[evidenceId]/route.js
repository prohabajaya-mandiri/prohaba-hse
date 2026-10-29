import { api, params } from '@/lib/http';
import { unlinkEvidence } from '@/lib/services/csms';
export const DELETE = api(async (request, context, user) => {
  const { id, evidenceId } = await params(context);
  return unlinkEvidence(user, id, evidenceId);
});
