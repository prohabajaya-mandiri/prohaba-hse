import { api, json, params } from '@/lib/http';
import { replyTicket, setTicketStatus } from '@/lib/services/support';
export const POST = api(async (request, context, user) => replyTicket(user, (await params(context)).id, await json(request)));
export const PUT = api(async (request, context, user) => setTicketStatus(user, (await params(context)).id, await json(request)));
