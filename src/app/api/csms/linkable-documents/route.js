import { api } from '@/lib/http';
import { linkableDocuments } from '@/lib/services/csms';
export const GET = api(async (request, context, user) => linkableDocuments(user, Object.fromEntries(new URL(request.url).searchParams)));
