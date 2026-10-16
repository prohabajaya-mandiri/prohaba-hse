import { api, json } from '@/lib/http';
import { createPlacement, listPlacements } from '@/lib/services/placements';
export const GET = api(async (request, context, user) => listPlacements(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createPlacement(user, await json(request)));
