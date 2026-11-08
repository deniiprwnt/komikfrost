"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, peekApiCache } from "@/lib/client";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { captureCoverMorph } from "@/lib/morph";
import { useUpdatedLabel } from "@/lib/relative-time";
import { CoverImage } from "./cover-image";
import type { MangaCard } from "@/lib/api/types";

/** Saat cover diklik: rekam posisi + gambar untuk animasi terbang ke detail. */
function coverMorphProps(slug: string) {
  return {
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) =>
      captureCoverMorph(slug, e.currentTarget.closest("article")),
  };
}

/** Ubah path chapter Komiku "/slug-chapter-11-2/" → route internal "/baca/slug/11-2". */
export function chapterPathToRoute(komikuPath: string): string {
  // Sudah berupa route internal (mis. hasil navigasi sebelumnya).
  if (komikuPath.startsWith("/baca/")) return komikuPath;
  const m = komikuPath.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)-chapter-(.+?)\/?$/i);
  if (!m) return "/";
  // Slug chapter Komikcast membawa sufiks "-bahasa-indonesia"; token route
  // harus nomor bersih agar /baca/<slug>/<token> tetap sah.
  const tok = m[2].replace(/-bahasa-indonesia$/i, "");
  return `/baca/${m[1]}/${tok}`;
}

const TYPE_STYLE: Record<string, string> = {
  manga: "bg-mark-manga",
  manhwa: "bg-mark-manhwa",
  manhua: "bg-mark-manhua",
};

/** Tanda tipe komik — kecil, seperti cap kertas, satu warna per tipe. */
export function TypeBadge({
  type,
  className = "",
  flush = false,
}: {
  type?: string;
  className?: string;
  /** Menempel di sudut cover: kotak tanpa lengkung, ukuran sama dengan SourceBadge. */
  flush?: boolean;
}) {
  if (!type) return null;
  const color = TYPE_STYLE[type.toLowerCase()] ?? "bg-muted";
  const shape = flush ? "rounded-none px-2 py-1 text-[9px]" : "rounded-sm px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-block max-w-full shrink-0 truncate font-extrabold uppercase leading-tight tracking-wide text-white ${shape} ${color} ${className}`}
    >
      {type}
    </span>
  );
}

/** Tanda sumber data — kecil seperti TypeBadge, satu warna per source. */
const SOURCE_STYLE: Record<string, string> = {
  shinigami: "bg-accent",
  komiku: "bg-mark-manhwa",
  komikcast: "bg-mark-manga",
};

const SOURCE_SHORT: Record<string, string> = {
  shinigami: "Shinigami",
  komiku: "Komiku",
  komikcast: "Komikcast",
};

/** Label asal data kartu (Shinigami / Komiku / keduanya). Diam bila tak ada info. */
export function SourceBadge({
  sources,
  className = "",
}: {
  sources?: string[];
  className?: string;
}) {
  if (!sources || sources.length === 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {sources.map((s) => {
        const key = s.toLowerCase();
        const color = SOURCE_STYLE[key] ?? "bg-muted";
        return (
          <span
            key={s}
            className={`inline-block shrink-0 truncate rounded-sm px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-tight tracking-wide text-white ${color}`}
          >
            {SOURCE_SHORT[key] ?? s}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Cadangan genre di sisi klien. Sebagian kartu (terutama yang hanya ada di
 * Komikcast) lahir tanpa genre dari daftar; server sudah mengisinya, tapi
 * bila gagal/terlambat, kartu menanyakannya sendiri lewat endpoint ringkas
 * (1 request, cache server 1 jam + cache klien). Tanpa ini kartu hanya
 * menampilkan "X menit lalu" tanpa genre sama sekali.
 */
function useResolvedGenre(item: MangaCard): string | undefined {
  const path = `/api/manga/${encodeURIComponent(item.slug)}?ringkas=1`;
  const [genre, setGenre] = useState<string | undefined>(
    () => item.genre || peekApiCache<TypeSummary>(path)?.genre,
  );
  useEffect(() => {
    // Reset per slug: komponen kartu bisa dipakai ulang dengan slug lain.
    setGenre(item.genre || peekApiCache<TypeSummary>(path)?.genre);
    if (item.genre) return;
    let off = false;
    apiGet<TypeSummary>(path)
      .then((d) => {
        if (!off && d?.genre) setGenre(d.genre);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.slug, item.genre, path]);
  return genre;
}

/**
 * Kartu grid vertikal: cover + judul + chapter terbaru.
 * `w-full`: pembungkus grid/rail bertipe flex, tanpa ini lebar kartu mengikuti
 * isi (judul/genre) sehingga antar kartu tidak seragam.
 */
export function MangaGridCard({ item }: { item: MangaCard }) {
  // Hover/sentuh = niat membuka — panaskan data detail agar halaman
  // tujuan terbuka dari cache (terasa instan). Sentuhan yang berubah jadi
  // scroll dibatalkan, lihat useIntentPrefetch.
  const warm = useIntentPrefetch(`/api/manga/${encodeURIComponent(item.slug)}`);
  // Label waktu dihitung ulang tiap menit (bukan teks beku dari server).
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  // Genre dari daftar, atau diambil sendiri bila kosong (Komikcast).
  const genre = useResolvedGenre(item);
  return (
    <article
      {...warm}
      className="cv-auto group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper-2 transition-colors duration-200 hover:border-accent/60 dark:border-line-dark dark:bg-ink-2"
    >
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        {...coverMorphProps(item.slug)}
        className="relative block aspect-[3/4] w-full shrink-0 overflow-hidden bg-paper-3 dark:bg-ink-3"
      >
        <CoverImage
          src={item.thumbnail}
          alt={item.title}
          title={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {/* z-10: <CoverImage> menaruh gambarnya di z-index 1, jadi badge
            harus di atasnya agar tetap terlihat. */}
        {item.type && (
          <div className="absolute left-0 top-0 z-10">
            <TypeBadge type={item.type} flush />
          </div>
        )}
        <SourceBadge
          className="absolute right-0 top-0 z-10 max-w-[55%] [&>span]:rounded-none [&>span]:px-1.5 [&>span]:py-1 [&>span]:text-[9px]"
          sources={item.latestSource ? [item.latestSource] : item.sources?.slice(0, 1)}
        />
        {item.latestChapter && (
          <span className="absolute bottom-0 left-0 z-10 max-w-full truncate bg-accent px-2 py-1 text-[11px] font-bold leading-none text-white">
            {item.latestChapter.label}
          </span>
        )}
      </Link>
      {/* flex-1 + meta `mt-auto`: judul 1 baris dan 2 baris menghasilkan
          tinggi blok teks berbeda, sehingga baris genre/waktu tiap kartu
          tampil di ketinggian berbeda. Dengan meta didorong ke dasar,
          semua baris genre/waktu sejajar mendatar antar kartu. */}
      <div className="flex min-w-0 flex-1 flex-col px-2.5 pb-2 pt-2.5">
        <Link
          href={`/komik/${item.slug}`}
          title={item.title}
          className="mb-2 line-clamp-2 break-words text-[13px] font-bold leading-snug text-fg hover:text-accent dark:text-fg-dark"
        >
          {item.title}
        </Link>
        {(genre || updated) && (
          // Dua kolom: genre (boleh terpotong) + waktu RATA KANAN.
          // Dulu keduanya satu teks "genre · waktu" sehingga posisi
          // "X menit lalu" bergeser mengikuti panjang genre dan kolom
          // waktu antar kartu tidak pernah sejajar.
          <p className="mt-auto flex min-w-0 items-baseline gap-1.5 border-t border-line pt-1.5 text-[11px] leading-tight text-muted dark:border-line-dark dark:text-muted-dark">
            <span className="min-w-0 flex-1 truncate">{genre}</span>
            {updated && (
              <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{updated}</span>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Ubin besar untuk beranda. `featured` mengisi 2×2 sel grid: cover penuh,
 * judul di blok solid (bukan gradien) menempel di dasar.
 */
export function UpdateTile({ item, featured = false }: { item: MangaCard; featured?: boolean }) {
  const warm = useIntentPrefetch(`/api/manga/${encodeURIComponent(item.slug)}`);
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  if (!featured) return <MangaGridCard item={item} />;
  return (
    <article
      {...warm}
      className="group relative aspect-[16/11] min-w-0 md:absolute md:inset-0 md:aspect-auto"
    >
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        {...coverMorphProps(item.slug)}
        className="chamfer absolute inset-0 block overflow-hidden bg-paper-3 dark:bg-ink-3"
      >
        <CoverImage
          src={item.thumbnail}
          alt={item.title}
          title={item.title}
          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 bottom-0 bg-ink p-3 text-fg-dark sm:p-4">
          <div className="flex items-center gap-2">
            <TypeBadge type={item.type} />
            {updated && <span className="text-[11px] tabular-nums text-muted-dark">{updated}</span>}
          </div>
          <p className="display-cond mt-1.5 line-clamp-2 text-2xl sm:text-3xl">{item.title}</p>
          {item.latestChapter && (
            <p className="mt-1.5 text-xs font-bold text-accent dark:text-white">{item.latestChapter.label}</p>
          )}
        </div>
      </Link>
    </article>
  );
}

/** Baris update horizontal: thumb landscape + judul + meta + chapter. */
export function UpdateRow({ item }: { item: MangaCard }) {
  const detailPath = `/api/manga/${encodeURIComponent(item.slug)}`;
  const warm = useIntentPrefetch(detailPath);
  const updated = useUpdatedLabel(item.updatedAt, item.updatedAtTs);
  return (
    <article
      {...warm}
      className="cv-row flex min-w-0 gap-2.5 border-b border-line py-2.5 last:border-0 sm:gap-3 sm:py-3 dark:border-line-dark"
    >
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        {...coverMorphProps(item.slug)}
        className="relative h-[58px] w-[88px] shrink-0 overflow-hidden rounded-sm bg-paper-3 min-[420px]:h-[68px] min-[420px]:w-[110px] dark:bg-ink-3"
      >
        <CoverImage src={item.thumbnail} alt="" title={item.title} className="h-full w-full object-cover" />
        {item.type && (
          <div className="absolute left-0 top-0 z-10">
            <TypeBadge type={item.type} flush />
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={`/komik/${item.slug}`}
            className="min-w-0 flex-1 truncate text-[13px] font-bold leading-snug text-fg hover:text-accent sm:text-sm dark:text-fg-dark"
          >
            {item.title}
          </Link>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
          <SourceBadge sources={item.latestSource ? [item.latestSource] : item.sources?.slice(0, 1)} />
          {item.genre && (
            <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-muted sm:text-xs dark:text-muted-dark">
              {item.genre}
            </p>
          )}
          {updated && (
            <span className="shrink-0 text-[10px] tabular-nums leading-tight text-muted sm:text-[11px] dark:text-muted-dark">
              {updated}
            </span>
          )}
        </div>
        {item.latestChapter && (
          <Link
            href={chapterPathToRoute(item.latestChapter.url)}
            className="mt-auto w-fit max-w-full truncate pt-1 text-xs font-semibold leading-tight text-accent hover:underline dark:text-white"
          >
            {item.latestChapter.label}
          </Link>
        )}
      </div>
    </article>
  );
}

const RANK_TINT = ["text-gold", "text-gold", "text-gold"];

/** Cache tipe per slug (modul-level) agar tidak fetch ulang. */
const typeCache = new Map<string, string>();

/** Ranking dari sumber data kerap tak membawa tipe. Bila kosong, ambil dari
 *  detail komik (cache dulu, lalu fetch) supaya badge MANGA/MANHWA/MANHUA selalu ada. */
/** Bentuk minimal respons /api/manga/<slug>?ringkas=1 (hanya field ini). */
type TypeSummary = { type?: string; genre?: string };

function useResolvedType(item: MangaCard): string | undefined {
  // ringkas=1: endpoint 1-request (Komiku saja). Detail merge penuh untuk
  // 10-20 baris peringkat terlalu berat — ini hanya untuk badge tipe.
  const summaryPath = `/api/manga/${encodeURIComponent(item.slug)}?ringkas=1`;
  const [type, setType] = useState<string | undefined>(
    () => item.type || typeCache.get(item.slug) || peekApiCache<TypeSummary>(summaryPath)?.type,
  );
  useEffect(() => {
    // Reset per slug (komponen bisa dipakai ulang).
    setType(
      item.type ||
        typeCache.get(item.slug) ||
        peekApiCache<TypeSummary>(summaryPath)?.type,
    );
    if (item.type) return;
    if (typeCache.get(item.slug)) return;
    let off = false;
    apiGet<TypeSummary>(summaryPath)
      .then((d) => {
        if (d?.type) typeCache.set(item.slug, d.type);
        if (!off && d?.type) setType(d.type);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.slug, item.type, summaryPath]);
  return type;
}



/** Baris ranking: lencana nomor, cover + tipe, judul, genre, views, chapter terbaru. */
export function RankRow({ item }: { item: MangaCard }) {
  const detailPath = `/api/manga/${encodeURIComponent(item.slug)}`;
  const warm = useIntentPrefetch(detailPath);
  const hasRank = typeof item.rank === "number";
  const type = useResolvedType(item);
  return (
    <article
      {...warm}
      className="cv-row group relative flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-paper-2 p-2.5 transition-[border-color,background-color,transform] duration-200 hover:border-accent/70 hover:bg-paper-3/60 active:scale-[0.99] sm:gap-3.5 sm:p-3 dark:border-line-dark dark:bg-ink-2 dark:hover:bg-ink-3/70"
    >
      {hasRank && (
        <span
          className={`w-6 shrink-0 text-center font-display text-lg font-black tabular-nums sm:w-7 sm:text-xl ${
            RANK_TINT[(item.rank as number) - 1] ?? "text-muted dark:text-muted-dark"
          }`}
        >
          {item.rank}
        </span>
      )}
      <Link
        href={`/komik/${item.slug}`}
        aria-label={item.title}
        {...coverMorphProps(item.slug)}
        className="relative z-10 h-[80px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-paper-3 shadow-md shadow-black/20 ring-1 ring-black/5 sm:h-[96px] sm:w-[72px] dark:bg-ink-3 dark:ring-white/10"
      >
        <CoverImage
          src={item.thumbnail}
          alt=""
          title={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/komik/${item.slug}`}
          title={item.title}
          className="break-words font-display text-sm font-bold leading-snug text-fg transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-accent sm:text-[15px] dark:text-fg-dark"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.title}
        </Link>
        {(item.genre || item.views || type) && (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-muted sm:text-xs dark:text-muted-dark">
            {item.genre && <span className="truncate">{item.genre}</span>}
            {item.genre && item.views && <span aria-hidden="true" className="h-0.5 w-0.5 shrink-0 rounded-full bg-current opacity-60" />}
            {item.views && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                  <circle cx="12" cy="12" r="2.75" />
                </svg>
                {String(item.views).replace(/\s*views?$/i, "")}
              </span>
            )}
            {type && <TypeBadge type={type} className="ml-auto rounded-sm px-1.5 py-0.5" />}
          </p>
        )}
        {item.latestChapter && (
          <Link
            href={chapterPathToRoute(item.latestChapter.url)}
            className="relative z-10 mt-1 inline-flex w-fit max-w-full items-center rounded-md bg-accent-soft px-2 py-1 text-[11px] font-semibold leading-tight text-accent-strong transition-colors hover:bg-accent hover:text-white sm:text-xs dark:bg-accent-soft-dark dark:text-white"
          >
            <span className="truncate">{item.latestChapter.label}</span>
            <span aria-hidden="true" className="ml-1 opacity-70">›</span>
          </Link>
        )}
      </div>
    </article>
  );
}
