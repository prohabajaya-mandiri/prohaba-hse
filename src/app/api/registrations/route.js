import { api } from '@/lib/http';
import { listRegistrations } from '@/lib/services/registrations';

export const GET = api(async (request, context, user) => listRegistrations(user, Object.fromEntries(new URL(request.url).searchParams)));
