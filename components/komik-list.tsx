"use client";

import Link from "next/link";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { captureCoverMorph } from "@/lib/morph";
import type { MangaCard } from "@/lib/api/types";
import { useUpdatedLabel } from "@/lib/relative-time";
import { chapterPathToRoute, SourceBadge, TypeBadge } from "./cards";

/**
 * Kartu list ala Komiku: cover + badge tipe + judul + "Genre | waktu" +
 * sinopsis + tombol "Awal" / "Terbaru".
 * Dipakai /terbaru dan /genre/[slug] agar tampilannya sama.
 */
export function KomikListCard({ item }: { item: MangaCard }) {
  const warm = useIntentPrefetch(`/api/manga/${encodeURIComponent(item.slug)}`);
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  return (
    <article
      {...warm}
      className="cv-auto flex min-w-0 gap-2.5 border-b border-line py-3 last:border-0 sm:gap-3.5 sm:py-3.5 dark:border-line-dark"
    >
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        onClick={(e) => captureCoverMorph(item.slug, e.currentTarget.closest("article"))}
        className="relative h-[132px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-paper-3 sm:h-[112px] sm:w-[168px] lg:h-[120px] lg:w-[150px] 2xl:h-[128px] 2xl:w-[192px] dark:bg-ink-3"
      >
        {item.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail} alt="" loading="lazy" decoding="async" fetchPriority="low" onLoad={(e) => e.currentTarget.classList.add("blur-done")} className="blur-up h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-1 text-center text-[11px] text-muted dark:text-muted-dark">
            Tanpa cover
          </span>
        )}
        {item.type && (
          <div className="absolute left-0 top-0">
            <TypeBadge type={item.type} flush />
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-start gap-1.5">
          <Link
            href={`/komik/${item.slug}`}
            className="min-w-0 flex-1 break-words font-display text-[13px] font-bold leading-snug text-fg hover:text-accent sm:text-[15px] dark:text-fg-dark"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title}
          </Link>
        </div>
        {(item.genre || updated) && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {/* Daftar baris: genre dan waktu BERDAMPINGAN ("Isekai · 4 menit
                lalu"). Lebar baris di sini panjang, jadi waktu yang didorong
                ke ujung kanan menjauh dari genrenya dan sulit dibaca. */}
            <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-muted sm:text-xs dark:text-muted-dark">
              {[item.genre, updated].filter(Boolean).join(" · ")}
            </p>
            <SourceBadge sources={item.latestSource ? [item.latestSource] : item.sources?.slice(0, 1)} />
          </div>
        )}
        {item.synopsis && (
          <p className="mt-1.5 line-clamp-2 break-words text-xs leading-relaxed text-fg/75 sm:text-[13px] dark:text-fg-dark/70">
            {item.synopsis}
          </p>
        )}
        {(item.firstChapter || item.latestChapter) && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 sm:mt-2 sm:gap-2">
            {item.firstChapter && (
              <Link
                href={chapterPathToRoute(item.firstChapter.url)}
                className="inline-flex min-h-9 min-w-0 flex-1 items-center justify-center truncate rounded-full border border-line bg-paper px-3.5 py-1 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent sm:min-h-0 sm:flex-none sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-xs dark:border-line-dark dark:bg-ink dark:text-fg-dark"
              >
                <span className="truncate">
                  <span className="sm:hidden">{item.firstChapter.label}</span>
                  <span className="hidden sm:inline">
                    Awal: <span className="font-bold">{item.firstChapter.label}</span>
                  </span>
                </span>
              </Link>
            )}
            {item.latestChapter && (
              <Link
                href={chapterPathToRoute(item.latestChapter.url)}
                className="inline-flex min-h-9 min-w-0 flex-1 items-center justify-center truncate rounded-full bg-accent px-3.5 py-1 text-xs font-semibold text-white transition-[opacity,transform] active:scale-[0.97] hover:opacity-90 sm:min-h-0 sm:flex-none sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-xs"
              >
                <span className="truncate">
                  <span className="sm:hidden">{item.latestChapter.label}</span>
                  <span className="hidden sm:inline">Terbaru: {item.latestChapter.label}</span>
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Skeleton loading untuk daftar list kartu. */
export function KomikListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y divide-line dark:divide-line-dark">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2.5 py-3 sm:gap-3.5 sm:py-3.5">
          <div className="shimmer h-[132px] w-[96px] shrink-0 rounded-lg sm:h-[112px] sm:w-[168px] lg:h-[120px] lg:w-[150px] 2xl:h-[128px] 2xl:w-[192px]" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="shimmer h-4 w-11/12 rounded" />
            <div className="shimmer h-3 w-1/2 rounded" />
            <div className="shimmer h-3 w-full rounded" />
            <div className="shimmer h-3 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
