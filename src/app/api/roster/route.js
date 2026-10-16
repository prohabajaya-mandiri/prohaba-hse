import { api } from '@/lib/http';
import { rosterBoard } from '@/lib/services/roster';
export const GET = api(async (request, context, user) => rosterBoard(user, Object.fromEntries(new URL(request.url).searchParams)));
