import { api, json, params } from '@/lib/http';
import { findingTransitionAction, getFinding, updateFinding } from '@/lib/services/csms-findings';
export const GET = api(async (request, context, user) => getFinding(user, (await params(context)).id));
export const PUT = api(async (request, context, user) => updateFinding(user, (await params(context)).id, await json(request)));
// Perpindahan status: START | SUBMIT_CLOSE | RETURN | CLOSE | REOPEN.
export const POST = api(async (request, context, user) => findingTransitionAction(user, (await params(context)).id, await json(request)));
