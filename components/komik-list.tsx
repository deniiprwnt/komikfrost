"use client";

import Link from "next/link";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { captureCoverMorph } from "@/lib/morph";
import type { MangaCard } from "@/lib/api/types";
import { useUpdatedLabel } from "@/lib/relative-time";
import { CoverImage } from "./cover-image";
import { chapterPathToRoute, SourceBadge, TypeBadge } from "./cards";

/**
 * Kartu list ala Komiku: cover + badge tipe/sumber + judul + "Genre Â· waktu" +
 * sinopsis + tombol "Awal" / "Terbaru".
 * Dipakai /terbaru dan /genre/[slug] agar tampilannya sama.
 *
 * Seluruh kartu bisa diklik: tautan judul diperluas menutupi kartu (stretched
 * link), sedangkan cover dan tombol chapter berada di atasnya (z-10) agar
 * tetap punya tujuan sendiri.
 */
export function KomikListCard({ item }: { item: MangaCard }) {
  const warm = useIntentPrefetch(`/api/manga/${encodeURIComponent(item.slug)}`);
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  // Animasi cover terbang ke detail tetap jalan walau yang diklik bukan cover.
  const morph = (e: React.MouseEvent<HTMLAnchorElement>) =>
    captureCoverMorph(item.slug, e.currentTarget.closest("article"));
  return (
    <article
      {...warm}
      className="cv-auto group relative flex min-w-0 gap-3 border-b border-line py-4 sm:gap-4 dark:border-line-dark"
    >
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        onClick={morph}
        className="cover-tile @container relative z-10 h-[132px] w-[96px] shrink-0 overflow-hidden rounded-[var(--r-cover)] bg-paper-3 sm:h-[112px] sm:w-[168px] lg:h-[120px] lg:w-[150px] 2xl:h-[128px] 2xl:w-[192px] dark:bg-ink-3"
      >
        <CoverImage
          src={item.thumbnail}
          fallbackSrcs={item.thumbnailCandidates}
          alt=""
          title={item.title}
          className="h-full w-full object-cover"
        />
        {/* Tipe (kiri) + sumber (kanan) sebaris di dalam cover, sama seperti
            kartu grid. Ukuran mengecil mengikuti lebar cover (container query). */}
        <div className="absolute inset-x-1.5 top-1.5 z-10 flex flex-nowrap items-center justify-between gap-1">
          {item.type ? (
            <TypeBadge
              type={item.type}
              flush
              className="px-1! py-0.5! text-[9px]! @[9rem]:px-1.5! @[9rem]:py-1! @[9rem]:text-[10px]!"
            />
          ) : (
            <span />
          )}
          <SourceBadge
            shrink
            className="ml-auto min-w-0 [&>span]:rounded-md [&>span]:px-1 [&>span]:py-0.5 [&>span]:text-[9px] @[9rem]:[&>span]:px-1.5 @[9rem]:[&>span]:py-1 @[9rem]:[&>span]:text-[10px]"
            sources={item.latestSource ? [item.latestSource] : item.sources?.slice(0, 1)}
          />
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-start gap-1.5">
          <Link
            href={`/komik/${item.slug}`}
            onClick={morph}
            className="min-w-0 flex-1 break-words font-display text-[13px] font-bold leading-snug tracking-[-0.005em] text-fg after:absolute after:inset-0 after:content-[''] group-hover:text-accent sm:text-[15px] dark:text-fg-dark"
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
          <p className="mt-1 min-w-0 truncate text-[11px] leading-tight text-muted sm:text-xs dark:text-muted-dark">
            {[item.genre, updated].filter(Boolean).join(" Â· ")}
          </p>
        )}
        {(
          <p className="mt-1.5 line-clamp-2 break-words text-xs leading-relaxed text-fg/75 sm:text-[13px] dark:text-fg-dark/70">
            {item.synopsis ?? "Sinopsis belum tersedia dari sumber."}
          </p>
        )}
        {(item.firstChapter || item.latestChapter) && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 sm:mt-2 sm:gap-2">
            {item.firstChapter && (
              <Link
                href={chapterPathToRoute(item.firstChapter.url)}
                className="relative z-10 inline-flex min-h-9 min-w-0 flex-1 items-center justify-center truncate rounded-[var(--r-ctl)] border border-line bg-paper px-3.5 py-1 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent sm:min-h-0 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs dark:border-line-dark dark:bg-ink dark:text-fg-dark"
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
                className="relative z-10 inline-flex min-h-9 min-w-0 flex-1 items-center justify-center truncate rounded-[var(--r-ctl)] bg-accent px-3.5 py-1 text-xs font-semibold text-white transition-[opacity,transform] active:scale-[0.97] hover:opacity-90 sm:min-h-0 sm:flex-none sm:px-2.5 sm:py-1 sm:text-xs"
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
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-line py-4 sm:gap-4 dark:border-line-dark">
          <div className="shimmer h-[132px] w-[96px] shrink-0 rounded-[var(--r-cover)] sm:h-[112px] sm:w-[168px] lg:h-[120px] lg:w-[150px] 2xl:h-[128px] 2xl:w-[192px]" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="shimmer h-4 w-11/12 rounded-md" />
            <div className="shimmer h-3 w-1/2 rounded-md" />
            <div className="shimmer h-3 w-full rounded-md" />
            <div className="shimmer h-3 w-2/3 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
