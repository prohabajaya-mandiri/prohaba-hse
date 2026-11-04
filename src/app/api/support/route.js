import { api, formData } from '@/lib/http';
import { createTicket, myTickets } from '@/lib/services/support';
export const GET = api(async (request, context, user) => myTickets(user));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createTicket(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
