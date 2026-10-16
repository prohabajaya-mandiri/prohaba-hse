import { auth } from '@/auth';
import { canAccess, isSameOriginMutation } from './access';

export async function authorizeApi(request) {
  const session = await auth();
  if (!session?.user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!canAccess(session.user.role, new URL(request.url).pathname, request.method) || !isSameOriginMutation(request)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}
