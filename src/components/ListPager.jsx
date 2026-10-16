import Link from "next/link";
export default function ListPager({ page, total, limit = 50, query = {} }) {
  const url = (n) => "?" + new URLSearchParams({ ...query, page: String(n) });
  return (
    <nav
      aria-label="Halaman data"
      style={{
        display: "flex",
        gap: 18,
        margin: "16px 0",
        alignItems: "center",
      }}
    >
      {page > 1 && <Link href={url(page - 1)}>← Sebelumnya</Link>}
      <span>
        Halaman {page} · {total} data
      </span>
      {page * limit < total && <Link href={url(page + 1)}>Berikutnya →</Link>}
    </nav>
  );
}
