"use client";

interface PaginationProps {
  page: number;
  hasNext: boolean;
  pending?: boolean;
  onChange: (page: number) => void;
}

/**
 * Nomor halaman yang ditampilkan. Sumber data hanya memberi tahu
 * "ada halaman berikutnya" (tanpa total halaman), jadi pola tampilnya:
 * - blok 5 angka: 1–5, 6–10, 11–15, dst (halaman aktif selalu di bloknya),
 * - di awal hanya 1–5 (tanpa tombol 6) — tombol › tetap bisa dipakai
 *   untuk maju satu per satu,
 * - tombol lompat ke awal blok berikutnya (mis. 6–10 → tombol 11) baru
 *   tampil setelah keluar dari blok pertama,
 * - angka 1 selalu jadi jangkar saat sudah jauh di dalam,
 * - "…" sebagai pemisah bila ada lompatan angka.
 */
function pageNumbers(page: number, hasNext: boolean): (number | "gap")[] {
  const blockStart = Math.floor((page - 1) / 5) * 5 + 1;
  const blockEnd = blockStart + 4;
  // Tanpa hasNext, halaman aktif adalah terakhir — potong blok sampai sini
  // agar tidak menampilkan nomor yang terbukti tidak ada.
  const blockTop = hasNext ? blockEnd : page;
  const keep = new Set<number>();
  for (let n = blockStart; n <= blockTop; n++) keep.add(n);
  // Jangkar ke halaman 1 saat sudah jauh di dalam.
  if (blockStart > 1) keep.add(1);
  // Lompat ke blok berikutnya — hanya setelah keluar dari blok pertama,
  // agar di awal tampil 1–5 saja.
  if (hasNext && blockStart > 1) keep.add(blockEnd + 1);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export function Pagination({ page, hasNext, pending, onChange }: PaginationProps) {
  // Satu-satunya halaman — tidak perlu pagination sama sekali.
  if (page <= 1 && !hasNext) return null;
  const numbers = pageNumbers(page, hasNext);
  // Mobile: tombol dibuat kompak (tinggi 36px, angka 13px) agar
  // pagination tidak mendominasi layar kecil. Desktop tetap seperti semula.
  const base =
    "flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded-[var(--r-pill)] border px-2.5 py-1 text-[13px] font-semibold transition-[color,border-color,transform] active:scale-[0.94] sm:min-h-0 sm:min-w-9 sm:py-1.5 sm:text-[13px]";
  const idle = "border-line bg-paper-2 text-fg hover:border-accent hover:text-accent dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark";
  const active = "border-accent bg-accent text-white";
  // Tombol ‹ › boleh meredup saat nonaktif; tombol angka JANGAN memakai
  // disabled:opacity agar halaman aktif (mis. ?page=2 → angka 2) tetap solid.
  const atStart = page <= 1;
  const atEnd = !hasNext;

  return (
    <nav
      aria-label="Navigasi halaman"
      className="flex min-w-0 flex-wrap items-center justify-center gap-1.5"
    >
      {!atStart && (
        <button
          onClick={() => onChange(page - 1)}
          disabled={pending}
          aria-label="Halaman sebelumnya"
          className={`${base} ${idle}`}
        >
          ‹
        </button>
      )}
      {numbers.map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-sm text-muted dark:text-muted-dark"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onChange(n)}
            disabled={pending && n !== page}
            aria-label={`Halaman ${n}`}
            aria-current={n === page ? "page" : undefined}
            aria-disabled={n === page}
            className={`${base} ${n === page ? `${active} cursor-default` : idle}`}
          >
            {n}
          </button>
        ),
      )}
      {!atEnd && (
        <button
          onClick={() => onChange(page + 1)}
          disabled={pending}
          aria-label="Halaman berikutnya"
          className={`${base} ${idle}`}
        >
          ›
        </button>
      )}
      {pending && (
        <span className="w-full text-center text-xs text-muted dark:text-muted-dark">
          Memuat…
        </span>
      )}
    </nav>
  );
}
