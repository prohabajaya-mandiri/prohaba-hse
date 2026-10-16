import { api, formData } from '@/lib/http';
import { createPersonnel, listPersonnel, pickPersonnel } from '@/lib/services/personnel';
import { requireWrite } from '@/lib/services/common';

export const GET = api(async (request, context, user) => {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  if (sp.picker) return pickPersonnel(user, sp);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  return listPersonnel(user, sp, { skip: (page - 1) * 50, take: 50 });
});

// multipart: data = JSON personel, ktp = file KTP (opsional)
export const POST = api(async (request, context, user) => {
  requireWrite(user, 'personnel');
  const form = await formData(request);
  return createPersonnel(user, JSON.parse(form.get('data') ?? '{}'), form.get('ktp') || null);
});
