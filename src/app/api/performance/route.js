import { api } from '@/lib/http';
import { recap } from '@/lib/services/performance';
export const GET = api(async (request, context, user) => recap(user, Object.fromEntries(new URL(request.url).searchParams)));
