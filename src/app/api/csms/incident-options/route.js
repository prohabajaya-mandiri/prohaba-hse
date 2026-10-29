import { api } from '@/lib/http';
import { incidentOptions } from '@/lib/services/csms-findings';
export const GET = api(async (request, context, user) => ({ rows: await incidentOptions(user, new URL(request.url).searchParams.get('siteId')) }));
