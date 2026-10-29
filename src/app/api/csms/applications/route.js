import { api, json } from '@/lib/http';
import { createApplication, listApplications } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => ({ rows: await listApplications(user, Object.fromEntries(new URL(request.url).searchParams)) }));
export const POST = api(async (request, context, user) => createApplication(user, await json(request)));
