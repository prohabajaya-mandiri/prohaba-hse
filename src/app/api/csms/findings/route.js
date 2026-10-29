import { api, json } from '@/lib/http';
import { createFinding, listFindings } from '@/lib/services/csms-findings';
export const GET = api(async (request, context, user) => listFindings(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createFinding(user, await json(request)));
