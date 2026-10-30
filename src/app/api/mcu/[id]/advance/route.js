import { api, formData, params } from '@/lib/http';
import { advanceMcu } from '@/lib/services/mcu';

// multipart: data = JSON isian tahap berikutnya, files = dokumen hasil MCU
export const POST = api(async (request, context, user) => {
  const form = await formData(request);
  return advanceMcu(user, (await params(context)).id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
});
