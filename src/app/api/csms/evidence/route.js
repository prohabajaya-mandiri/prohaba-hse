import { api } from '@/lib/http';
import { listEvidence } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => listEvidence(user, Object.fromEntries(new URL(request.url).searchParams)));
