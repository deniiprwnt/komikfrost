"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { usePageTitle } from "@/lib/page-title";
import { chapterTokenFromKomikuUrl, useBookmarks } from "@/lib/bookmarks";
import { useHistory } from "@/lib/history";
import type { MangaDetail } from "@/lib/api/types";
import { chapterPathToRoute, TypeBadge } from "@/components/cards";
import { SectionHead, EmptyState } from "@/components/states";

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chapter terbaru yang belum dibaca/dilihat: { label, url Komiku }. */
type UpdateMap = Record<string, { label: string; url: string }>;

export default function FavoritPage() {
  usePageTitle("Favorit");
  const { bookmarks, remove } = useBookmarks();
  const { entries: history } = useHistory();
  const [filter, setFilter] = useState("");
  // Badge "BARU": dicek di background setelah daftar tampil (konkurensi 3,
  // pakai cache 30 dtk apiGet — ramah rate limit). Gagal fetch = tanpa badge.
  const [updates, setUpdates] = useState<UpdateMap>({});

  useEffect(() => {
    if (bookmarks.length === 0) {
      setUpdates({});
      return;
    }
    let cancelled = false;
    const histMap = new Map(history.map((e) => [e.slug, e.chapter]));
    const run = async () => {
      const out: UpdateMap = {};
      const queue = [...bookmarks];
      const workers = Array.from({ length: 3 }, async () => {
        while (queue.length > 0 && !cancelled) {
          const b = queue.shift();
          if (!b) break;
          try {
            // ringkas=1: 1 request (Komiku saja) per favorit, bukan merge
            // tiga sumber. Badge "BARU" hanya perlu chapter terbaru.
            const d = await apiGet<MangaDetail>(
              `/api/manga/${encodeURIComponent(b.slug)}?ringkas=1`,
            );
            if (cancelled || !d.latestChapter) continue;
            const latestTok = chapterTokenFromKomikuUrl(d.latestChapter.url);
            if (!latestTok) continue;
            // Sudah terlihat = pernah buka detail saat chapter ini terbaru,
            // ATAU sedang membaca chapter ini (riwayat). Tanpa keduanya
            // (bookmark lama yang belum pernah dibuka) → jangan badge,
            // jadikan kunjungan detail berikutnya sebagai baseline.
            const seen = new Set(
              [
                b.latestSeen ? chapterTokenFromKomikuUrl(b.latestSeen) : "",
                histMap.get(b.slug) ?? "",
              ].filter(Boolean),
            );
            if (seen.size > 0 && !seen.has(latestTok)) {
              out[b.slug] = { label: d.latestChapter.label, url: d.latestChapter.url };
            }
          } catch {
            // Tanpa badge untuk judul ini — detail diklik user akan fetch ulang.
          }
        }
      });
      await Promise.all(workers);
      if (!cancelled) setUpdates(out);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [bookmarks, history]);

  const filtered = bookmarks.filter((b) =>
    b.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const updateCount = bookmarks.filter((b) => updates[b.slug]).length;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 sm:gap-4 sm:p-4 dark:border-line-dark dark:bg-ink-2">
      <div className="min-w-0">
        <SectionHead title="Favorit" href="/riwayat" linkLabel="Riwayat →" />
        {bookmarks.length > 0 && (
          <p className="-mt-2 text-xs text-muted dark:text-muted-dark">
            {bookmarks.length} judul · tersimpan di perangkat ini
            {updateCount > 0 && (
              <span className="font-semibold text-fresh dark:text-fresh-dark">
                {" "}
                · {updateCount} update baru
              </span>
            )}
          </p>
        )}
      </div>

      {bookmarks.length > 5 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari favorit…"
          aria-label="Cari di daftar favorit"
          enterKeyHint="search"
          className="search-field h-12 w-full min-w-0 rounded-full border border-line bg-paper-2 px-4 text-base text-fg outline-none placeholder:text-muted sm:h-10 sm:max-w-xs sm:text-sm dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
        />
      )}

      {bookmarks.length === 0 && (
        <EmptyState message="Belum ada favorit. Ketuk ikon bookmark di halaman komik untuk menyimpan judul kesukaanmu di sini." />
      )}

      {bookmarks.length > 0 && filtered.length === 0 && (
        <EmptyState message={`Tidak ada favorit yang cocok dengan "${filter}".`} />
      )}

      {filtered.length > 0 && (
        <div className="grid-cards min-w-0">
          {filtered.map((b) => (
            <article
              key={b.slug}
              className="cv-auto group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper-2 hover:border-accent/60 dark:border-line-dark dark:bg-ink-2"
            >
              <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-paper-3 dark:bg-ink-3">
                <Link
                  href={`/komik/${b.slug}`}
                  aria-label={b.title}
                  className="absolute inset-0 block"
                >
                  {b.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.cover}
                      alt={b.title}
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      onLoad={(e) => e.currentTarget.classList.add("blur-done")}
                      className="blur-up h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted dark:text-muted-dark">
                      Tanpa cover
                    </span>
                  )}
                </Link>
                {b.type && (
                  <div className="pointer-events-none absolute left-1.5 top-1.5">
                    <TypeBadge type={b.type} />
                  </div>
                )}
                {updates[b.slug] && (
                  <Link
                    href={chapterPathToRoute(updates[b.slug].url)}
                    title={`Baca ${updates[b.slug].label} sekarang`}
                    className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md bg-fresh px-2 py-0.5 text-[10px] font-bold text-white shadow"
                  >
                    BARU · {updates[b.slug].label}
                  </Link>
                )}
              </div>
              <button
                onClick={() => remove(b.slug)}
                aria-label={`Hapus ${b.title} dari favorit`}
                className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-mark-manga"
              >
                <IconTrash className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col p-2 sm:p-2.5">
                <Link
                  href={`/komik/${b.slug}`}
                  className="truncate text-xs font-semibold leading-snug text-fg hover:text-accent sm:text-[13px] dark:text-fg-dark"
                >
                  {b.title}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
