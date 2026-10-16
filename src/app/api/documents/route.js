import { api, formData } from '@/lib/http';
import { createDocument, listDocuments } from '@/lib/services/documents';
export const GET = api(async (request, context, user) => listDocuments(user, Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createDocument(user, JSON.parse(form.get('data') ?? '{}'), form.get('file'));
});
