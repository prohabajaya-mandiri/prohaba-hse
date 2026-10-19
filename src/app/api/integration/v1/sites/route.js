import { integrationApi } from '@/lib/integration';
import { prisma } from '@/lib/prisma';

// Daftar site untuk pilihan "Site awal" pada form karyawan aplikasi lain.
export const GET = integrationApi(async () => ({
  rows: await prisma.site.findMany({
    select: { id: true, code: true, name: true, region: true, isHo: true, isActive: true },
    orderBy: [{ isHo: 'desc' }, { name: 'asc' }],
  }),
}));
