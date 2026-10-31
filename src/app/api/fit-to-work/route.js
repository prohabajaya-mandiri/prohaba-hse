import { api, formData } from '@/lib/http';
import { createSession, listSessions } from '@/lib/services/fit-to-work';
export const GET = api(async (request, context, user) => listSessions(user, Object.fromEntries(new URL(request.url).searchParams)));
// multipart: data = JSON sesi + peserta, files = scan form P5M & foto
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createSession(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
