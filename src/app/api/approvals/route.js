import { api } from '@/lib/http';
import { pendingApprovals } from '@/lib/services/inbox';

export const GET = api(async (request, context, user) => pendingApprovals(user));
