// Nomor dokumen berurutan per kunci, aman terhadap transaksi bersamaan (upsert atomik).
export async function nextNumber(tx, key, prefix, width = 4) {
  const row = await tx.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return prefix + String(row.value).padStart(width, '0');
}
