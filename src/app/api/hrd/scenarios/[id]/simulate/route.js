import { api, params } from '@/lib/http';
import { runSimulation } from '@/lib/services/hrd';
export const GET = api(async (request, context, user) => runSimulation(user, (await params(context)).id, Object.fromEntries(new URL(request.url).searchParams)));
