// Memuat ulang pengguna setiap permintaan agar perubahan role/site/nonaktif langsung berlaku.
export async function loadSessionUser(db, id, operatorId) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, region: true, isActive: true, isShared: true, sessionVersion: true,
      sites: { select: { siteId: true } },
    },
  });
  if (!user) return null;
  const siteIds = new Set(user.sites.map((s) => s.siteId));
  // PM memantau wilayah: seluruh site aktif di wilayahnya ikut dalam cakupan.
  if (user.role === 'PM' && user.region) {
    const regional = await db.site.findMany({ where: { region: user.region }, select: { id: true } });
    regional.forEach((s) => siteIds.add(s.id));
  }
  let operator = null;
  if (user.isShared && operatorId) {
    operator = await db.operator.findFirst({ where: { id: operatorId, userId: id, isActive: true }, select: { id: true, name: true } });
  }
  return {
    ...user,
    siteIds: [...siteIds],
    operatorId: operator?.id ?? null,
    operatorName: operator?.name ?? null,
  };
}
