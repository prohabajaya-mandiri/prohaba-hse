import { api, json } from '@/lib/http';
import { createReport, listReports } from '@/lib/services/reports';
export const GET = api(async (request, context, user) => listReports(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createReport(user, await json(request)));
