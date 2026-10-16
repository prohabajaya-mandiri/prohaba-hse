import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canAccess, siteScope } from '@/lib/access';
import { prisma } from '@/lib/prisma';

// Guard halaman server: login + izin modul. Mengembalikan user sesi.
export async function requirePage(path) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!canAccess(session.user.role, path)) redirect('/dashboard');
  return session.user;
}

export async function scopedSites(user, { activeOnly = false } = {}) {
  const scope = siteScope(user);
  return prisma.site.findMany({
    where: { ...(scope === null ? {} : { id: { in: scope } }), ...(activeOnly ? { isActive: true } : {}) },
    select: { id: true, code: true, name: true, region: true, isHo: true, isActive: true },
    orderBy: [{ isHo: 'desc' }, { name: 'asc' }],
  });
}

export const siteOptions = (sites) => sites.map((s) => [s.id, `${s.code} — ${s.name}`]);

export async function query(searchParams) {
  const q = (await searchParams) ?? {};
  const page = Math.max(1, Math.min(100000, parseInt(q.page ?? '1', 10) || 1));
  return { ...q, page, skip: (page - 1) * 50, take: 50 };
}
