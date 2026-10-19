import { formData } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { createPersonnel, listPersonnel, pickPersonnel } from '@/lib/services/personnel';

// Sama dengan /api/personnel, tetapi diautentikasi tanda tangan aplikasi (lihat lib/integration.js).
export const GET = integrationApi(async (request, context, user) => {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  if (sp.picker) return pickPersonnel(user, sp);
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  return listPersonnel(user, sp, { skip: (page - 1) * 50, take: 50 });
});

// multipart: data = JSON personel, ktp = file KTP (opsional)
export const POST = integrationApi(async (request, context, user) => {
  const form = await formData(request);
  return createPersonnel(user, JSON.parse(form.get('data') ?? '{}'), form.get('ktp') || null);
});
