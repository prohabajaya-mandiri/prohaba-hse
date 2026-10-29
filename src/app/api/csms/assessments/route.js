import { api, json } from '@/lib/http';
import { createAssessment, listAssessments } from '@/lib/services/csms-assessment';
export const GET = api(async (request, context, user) => listAssessments(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createAssessment(user, await json(request)));
