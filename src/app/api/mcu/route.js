import { api, formData } from '@/lib/http';
import { createMcu, listMcu } from '@/lib/services/mcu';

export const GET = api(async (request, context, user) => listMcu(user, Object.fromEntries(new URL(request.url).searchParams)));
// multipart: data = JSON, files = dokumen MCU
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return createMcu(user, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
