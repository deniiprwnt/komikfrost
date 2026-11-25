"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";
import { chapterAgoLabel, parseDateId } from "@/lib/chapter-date";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { fitToRows, useGridCols } from "@/lib/use-grid-cols";
import { captureCoverMorph } from "@/lib/morph";
import { useNowTick, useUpdatedLabel } from "@/lib/relative-time";
import type { ChapterRef, MangaCard, MangaDetail } from "@/lib/api/types";
import { CoverImage } from "./cover-image";
import { chapterPathToRoute, SourceBadge, TypeBadge } from "./cards";

/** Satu chapter di kartu: label, tautan baca, dan waktu rilis (bila diketahui). */
interface ChapInfo {
  label: string;
  href: string;
  ts?: number | undefined;
}

interface Resolved {
  latest?: ChapInfo | undefined;
  prev?: ChapInfo | undefined;
}

/** Nomor chapter dari route baca "/baca/slug/11-2" â†’ 11.2. */
function routeNumber(route: string): number | undefined {
  const m = route.match(/^\/baca\/[^/]+\/([\d-]+)$/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace("-", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tebakan sementara sebelum detail komik datang: nomor bulat terbaru âˆ’ 1
 * ("Chapter 317" â†’ "Chapter 316"), tanpa waktu. Nomor desimal tidak ditebak.
 */
function guessPrevious(latest?: ChapterRef): ChapInfo | undefined {
  if (!latest) return undefined;
  const rm = chapterPathToRoute(latest.url).match(/^(\/baca\/[^/]+\/)(\d+)$/);
  const lm = latest.label.match(/^(.*?)(\d+)\s*$/);
  if (!rm || !lm) return undefined;
  const n = parseInt(rm[2], 10);
  if (n < 2 || parseInt(lm[2], 10) !== n) return undefined;
  return { label: `${lm[1]}${n - 1}`, href: `${rm[1]}${n - 1}` };
}

/**
 * Chapter terbaru + sebelumnya dari daftar chapter detail komik.
 * - Kartu punya chapter terbaru: dipakai apa adanya (waktunya dicari di detail),
 *   sebelumnya = nomor tertinggi di bawahnya.
 * - Kartu TIDAK punya chapter terbaru (sumber daftar tidak memberinya): terbaru =
 *   nomor tertinggi di detail.
 * Detail tanpa chapter â†’ undefined (kartu tetap memakai tebakan).
 */
function resolveFromDetail(d: MangaDetail | undefined, latestRef?: ChapterRef): Resolved | undefined {
  const list = (d?.chapters ?? []).map((c) => {
    const href = chapterPathToRoute(c.url);
    const ts = c.dateTs ?? parseDateId(c.date);
    const info: ChapInfo = { label: c.title, href, ...(typeof ts === "number" ? { ts } : {}) };
    return { n: routeNumber(href), info };
  });
  if (list.length === 0) return undefined;
  const numbered = list.filter((x): x is { n: number; info: ChapInfo } => x.n !== undefined);
  if (numbered.length === 0) {
    return latestRef ? undefined : { latest: list[0]?.info, prev: list[1]?.info };
  }

  let top: number | undefined;
  let latest: ChapInfo | undefined;
  if (latestRef) {
    const href = chapterPathToRoute(latestRef.url);
    top = routeNumber(href);
    const match = numbered.find((x) => x.info.href === href);
    latest = {
      label: latestRef.label,
      href,
      ...(typeof match?.info.ts === "number" ? { ts: match.info.ts } : {}),
    };
  } else {
    let best = numbered[0];
    for (const x of numbered) if (x.n > best.n) best = x;
    top = best.n;
    latest = best.info;
  }

  let prev: { n: number; info: ChapInfo } | undefined;
  if (top !== undefined) {
    for (const x of numbered) {
      if (x.n < top && (!prev || x.n > prev.n)) prev = x;
    }
  }
  return { latest, prev: prev?.info };
}

/* Cache modul + antrean: maksimal 3 permintaan detail bersamaan supaya satu
   halaman penuh kartu tidak menembak puluhan scrape sekaligus. */
const detailCache = new Map<string, Resolved>();
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < 3) {
      active++;
      resolve();
    } else {
      waiting.push(() => {
        active++;
        resolve();
      });
    }
  });
}

function release(): void {
  active--;
  waiting.shift()?.();
}

/**
 * Chapter terbaru + sebelumnya untuk satu kartu. Detail komik diambil saat
 * kartu terlihat; sebelum itu (atau bila gagal) dipakai data kartu + tebakan.
 */
function useChapters(item: MangaCard, visible: boolean): Resolved {
  const latestRef = item.latestChapter;
  const key = `${item.slug}#${latestRef?.url ?? ""}`;
  const [detail, setDetail] = useState<Resolved | undefined>(() => detailCache.get(key));

  useEffect(() => {
    setDetail(detailCache.get(key));
    if (!visible || detailCache.has(key)) return;
    let off = false;
    void (async () => {
      await acquire();
      try {
        if (off) return;
        const d = await apiGet<MangaDetail>(`/api/manga/${encodeURIComponent(item.slug)}`);
        const r = resolveFromDetail(d, latestRef);
        if (!r) return;
        detailCache.set(key, r);
        if (!off) setDetail(r);
      } catch {
        // Gagal = tetap pakai data kartu / tebakan.
      } finally {
        release();
      }
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible]);

  const base: ChapInfo | undefined = latestRef
    ? { label: latestRef.label, href: chapterPathToRoute(latestRef.url) }
    : undefined;
  return {
    latest: detail ? (detail.latest ?? base) : base,
    prev: detail ? detail.prev : guessPrevious(latestRef),
  };
}

/**
 * Kartu grid untuk /terbaru, /genre dan /cari: cover 3:4 (badge tipe kiri +
 * sumber kanan), judul, lalu dua baris chapter (terbaru + waktu update, dan
 * chapter sebelumnya + waktu rilisnya).
 *
 * Seluruh kartu bisa diklik lewat tautan judul yang diperluas (stretched
 * link); cover dan baris chapter berada di atasnya (z-10) agar tetap punya
 * tujuan sendiri.
 */
export function LatestCard({ item }: { item: MangaCard }) {
  const warm = useIntentPrefetch(`/api/manga/${encodeURIComponent(item.slug)}`);
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  const now = useNowTick();
  const sources = item.latestSource ? [item.latestSource] : item.sources?.slice(0, 1);

  // Detail (untuk chapter yang kosong / sebelumnya) hanya diambil setelah kartu mendekati layar.
  const coverRef = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { latest, prev } = useChapters(item, visible);
  const latestWhen =
    updated || (latest && typeof latest.ts === "number" && now !== null ? chapterAgoLabel(latest.ts, now) : undefined);
  const prevWhen = prev && typeof prev.ts === "number" && now !== null ? chapterAgoLabel(prev.ts, now) : undefined;

  // Animasi cover terbang ke detail tetap jalan walau yang diklik judulnya.
  const morph = (e: React.MouseEvent<HTMLAnchorElement>) =>
    captureCoverMorph(item.slug, e.currentTarget.closest("article"));

  return (
    <article
      {...warm}
      className="lc-card cv-auto group relative flex h-full w-full min-w-0 flex-col overflow-hidden border border-line bg-paper-2 transition-colors hover:border-accent/50 dark:border-line-dark dark:bg-ink-2"
    >
      <Link
        ref={coverRef}
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        onClick={morph}
        className="cover-tile @container relative z-10 block aspect-[3/4] w-full shrink-0 overflow-hidden bg-paper-3 dark:bg-ink-3"
      >
        <CoverImage
          src={item.thumbnail}
          fallbackSrcs={item.thumbnailCandidates}
          alt=""
          title={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="cv-badges absolute inset-x-2 top-2 z-10">
          {item.type ? <TypeBadge type={item.type} flush /> : <span />}
          <SourceBadge shrink className="ml-auto min-w-0" sources={sources} />
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-3 pt-2.5">
          <Link
            href={`/komik/${item.slug}`}
            title={item.title}
            onClick={morph}
            className="line-clamp-2 break-words font-display text-[13px] font-bold leading-snug tracking-[-0.005em] text-fg after:absolute after:inset-0 after:content-[''] group-hover:text-accent sm:text-sm dark:text-fg-dark"
          >
            {item.title}
          </Link>
        </div>

        {(latest || prev) && (
          <div
            className={`${latest && prev ? "mt-auto" : "mt-0"} flex min-w-0 flex-col gap-1.5 px-2.5 pb-2.5 pt-2.5`}
          >
            {latest && (
              <Link
                href={latest.href}
                className="relative z-10 flex min-w-0 items-center justify-between gap-2 rounded-[var(--r-ctl)] bg-paper px-2.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:text-accent dark:bg-ink-3 dark:text-fg-dark"
              >
                <span className="min-w-0 truncate">{latest.label}</span>
                {latestWhen && (
                  <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-muted dark:text-muted-dark">
                    {latestWhen}
                  </span>
                )}
              </Link>
            )}
            {prev && (
              <Link
                href={prev.href}
                className="relative z-10 flex min-w-0 items-center justify-between gap-2 rounded-[var(--r-ctl)] bg-paper px-2.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:text-accent dark:bg-ink-3 dark:text-fg-dark"
              >
                <span className="min-w-0 truncate">{prev.label}</span>
                {prevWhen && (
                  <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-muted dark:text-muted-dark">
                    {prevWhen}
                  </span>
                )}
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Grid kartu untuk /terbaru, /genre dan /cari. Jumlah kartu dipangkas ke
 * kelipatan jumlah kolom aktif (selama masih ada halaman berikutnya) agar
 * baris terakhir tidak menyisakan kartu yatim di desktop.
 */
export function LatestGrid({
  items,
  hasNext,
  className = "",
}: {
  items: MangaCard[];
  hasNext: boolean;
  className?: string;
}) {
  const cols = useGridCols();
  const shown = fitToRows(items, cols, hasNext);
  return (
    <div
      className={`stagger lc-grid grid min-w-0 grid-cols-2 gap-3 min-[560px]:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 ${className}`}
    >
      {shown.map((item, idx) => (
        <Fragment key={`${item.slug}#${item.latestChapter?.url ?? ""}`}>
          {item.exactMatch === false && (idx === 0 || shown[idx - 1]?.exactMatch !== false) && (
            <p className="col-span-full px-1 pt-2 text-xs font-semibold text-muted dark:text-muted-dark">
              Hasil mirip (tidak ada judul yang memuat semua kata kunci)
            </p>
          )}
          <div className="flex min-w-0">
            <LatestCard item={item} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Skeleton kartu grid. Kolom grid harus sama dengan di app/terbaru/page.tsx. */
export function LatestCardsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="lc-card flex min-w-0 flex-col overflow-hidden border border-line bg-paper-2 dark:border-line-dark dark:bg-ink-2"
        >
          <div className="shimmer aspect-[3/4] w-full" />
          <div className="space-y-1.5 p-2.5">
            <div className="shimmer h-3 w-11/12 rounded-md" />
            <div className="shimmer h-3 w-2/3 rounded-md" />
            <div className="shimmer mt-2 h-8 w-full rounded-[var(--r-ctl)]" />
            <div className="shimmer h-8 w-full rounded-[var(--r-ctl)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
