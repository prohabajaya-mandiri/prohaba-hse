import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ListPager({ page, total, limit = 50, query = {} }) {
  if (!total) return null;
  const url = (n) => "?" + new URLSearchParams({ ...query, page: String(n) });
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav aria-label="Halaman data" className="pager">
      <span>
        Menampilkan {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari{" "}
        {total.toLocaleString("id-ID")} data
        {pages > 1 ? ` · halaman ${page} dari ${pages}` : ""}
      </span>
      {pages > 1 && (
        <span className="pager-nav">
          {page > 1 ? (
            <Link className="btn btn-outline btn-sm" href={url(page - 1)}>
              <ChevronLeft aria-hidden /> Sebelumnya
            </Link>
          ) : (
            <span className="btn btn-outline btn-sm" aria-disabled="true">
              <ChevronLeft aria-hidden /> Sebelumnya
            </span>
          )}
          {page < pages ? (
            <Link className="btn btn-outline btn-sm" href={url(page + 1)}>
              Berikutnya <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span className="btn btn-outline btn-sm" aria-disabled="true">
              Berikutnya <ChevronRight aria-hidden />
            </span>
          )}
        </span>
      )}
    </nav>
  );
}
