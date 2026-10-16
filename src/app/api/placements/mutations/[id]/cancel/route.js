import { api, params } from '@/lib/http';
import { cancelMutation } from '@/lib/services/placements';
export const POST = api(async (request, context, user) => cancelMutation(user, (await params(context)).id));
