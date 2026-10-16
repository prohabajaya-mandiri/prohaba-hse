import { api } from '@/lib/http';
import { hrBoard } from '@/lib/services/hrd';
export const GET = api(async (request, context, user) => hrBoard(user, Object.fromEntries(new URL(request.url).searchParams)));
