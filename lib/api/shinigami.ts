/**
 * lib/api/shinigami.ts â€” SHIM ke Kiryuu.
 *
 * Slot source di kode tetap bernama "shinigami" (identifier SOURCE_PRIORITY
 * + field sourceSlug), tetapi SEMUA data sekarang berasal dari Kiryuu
 * (`lib/api/kiryuu.ts`). Nama fungsi `fetchShini*` dipertahankan agar
 * pemanggil (manga.ts / chapter.ts / comments.ts) tidak perlu diubah.
 *
 * Utilitas tanggal & parsing nomor chapter tetap didefinisikan di sini
 * karena beberapa pemanggil mengimpornya lewat modul ini.
 */
import type {
  ChapterData,
  GenreRef,
  KomikType,
  MangaCard,
  MangaDetail,
  PagedResult,
} from "./types";
import { KomikuError } from "./komiku";
import {
  fetchKiryuuByGenre,
  fetchKiryuuChapter,
  fetchKiryuuDetail,
  fetchKiryuuGenres,
  fetchKiryuuLatest,
  fetchKiryuuMeta,
  fetchKiryuuPopular,
  fetchKiryuuRecommended,
  findKiryuuSlugByTitles,
  resolveKiryuuDetailForSlug,
  type KiryuuBrief,
} from "./kiryuu";
import { formatDateId as formatDateIdWib } from "../chapter-date";
import { chapterNum } from "./aggregator";

/* ------------------------------------------------------------------ */
/* Utilitas tanggal & nomor                                            */
/* ------------------------------------------------------------------ */

export function timeAgoId(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (mins < 1) return "1 detik lalu";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} minggu lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;
  return `${Math.floor(days / 365)} tahun lalu`;
}

export function fmtDateId(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return formatDateIdWib(t);
}

export function numToken(n: number): string {
  return String(n).replace(".", "-");
}

export function parseNumToken(tok: string): number {
  const t = tok.replace(/-(\d+)$/, ".$1");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------------------------------------------ */
/* Kompatibilitas tipe                                                 */
/* ------------------------------------------------------------------ */

export type ShiniFormat = "manga" | "manhwa" | "manhua";
export type ShiniTopFilter = "daily" | "weekly" | "all_time";

/** UUID â€” selalu false untuk slug Kiryuu. Dipertahankan agar pemanggil
 *  yang memakainya (chapter.ts, manga.ts) tetap jalan tanpa perubahan. */
export function isShiniId(slug: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    slug.replace(/^\/+|\/+$/g, ""),
  );
}

/* ------------------------------------------------------------------ */
/* Daftar / ranking / rekomendasi / pencarian                          */
/* ------------------------------------------------------------------ */

export interface ShiniLatestOpts {
  format?: ShiniFormat;
  genre?: string;
  pageSize?: number;
  fresh?: boolean;
}

export async function fetchShiniLatest(
  page = 1,
  opts: ShiniLatestOpts = {},
): Promise<PagedResult<MangaCard>> {
  const pageSize = opts.pageSize ?? 24;
  if (opts.genre) {
    try {
      const g = await fetchKiryuuByGenre(opts.genre, page, pageSize);
      // Filter tipe juga berlaku di jalur genre (dulu hanya di jalur tanpa genre,
      // sehingga Manhua/Manhwa ikut muncul saat tipe=manga diminta).
      if (!opts.format) return g;
      const wantType = opts.format === "manga" ? "Manga" : opts.format === "manhwa" ? "Manhwa" : "Manhua";
      return { items: g.items.filter((c) => c.type === wantType), hasNextPage: g.hasNextPage };
    } catch {
      return { items: [], hasNextPage: false };
    }
  }
  const r = await fetchKiryuuLatest(page, { pageSize, fresh: opts.fresh });
  if (opts.format) {
    const want = opts.format === "manga" ? "Manga" : opts.format === "manhwa" ? "Manhwa" : "Manhua";
    return { items: r.items.filter((c) => c.type === want), hasNextPage: r.hasNextPage };
  }
  return r;
}

/** Kiryuu tidak punya endpoint top â€” biarkan Komiku/Komikcast yang
 *  mengisi peringkat. */
export async function fetchShiniTop(
  filter: ShiniTopFilter = "daily",
  _page = 1,
  pageSize = 10,
): Promise<MangaCard[]> {
  void _page;
  const period = filter === "daily" ? "daily" : filter === "weekly" ? "weekly" : "monthly";
  try {
    return await fetchKiryuuPopular(period, pageSize);
  } catch {
    return [];
  }
}

export async function fetchShiniRecommended(pageSize = 24): Promise<MangaCard[]> {
  try {
    return await fetchKiryuuRecommended(pageSize);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Genre                                                               */
/* ------------------------------------------------------------------ */

export async function fetchShiniGenres(): Promise<GenreRef[]> {
  return fetchKiryuuGenres();
}

/* ------------------------------------------------------------------ */
/* Resolusi & meta                                                     */
/* ------------------------------------------------------------------ */

export async function findShiniIdByTitles(
  titles: ReadonlyArray<string | null | undefined>,
): Promise<string | null> {
  return findKiryuuSlugByTitles(titles);
}

export async function resolveShiniDetailForSlug(
  slug: string,
  altTitle?: string,
): Promise<MangaDetail> {
  return resolveKiryuuDetailForSlug(slug, altTitle);
}

export type ShiniBrief = KiryuuBrief;

export async function fetchShiniMeta(slug: string): Promise<ShiniBrief> {
  return fetchKiryuuMeta(slug);
}

/* ------------------------------------------------------------------ */
/* Detail & daftar chapter                                             */
/* ------------------------------------------------------------------ */

export async function fetchShiniDetail(slug: string): Promise<MangaDetail> {
  return fetchKiryuuDetail(slug);
}

interface ShiniChapterRowCompat {
  chapter_id: string;
  manga_id: string;
  chapter_number: number;
  chapter_title?: string;
  release_date?: string;
}

export async function fetchShiniChaptersAll(mangaSlug: string): Promise<ShiniChapterRowCompat[]> {
  const detail = await fetchKiryuuDetail(mangaSlug);
  const out: ShiniChapterRowCompat[] = [];
  for (const ch of detail.chapters) {
    const n = chapterNum(ch.title);
    if (!Number.isFinite(n)) continue;
    out.push({
      chapter_id: ch.chapterId ?? ch.url,
      manga_id: mangaSlug,
      chapter_number: n,
      ...(ch.title ? { chapter_title: ch.title } : {}),
      ...(ch.date ? { release_date: ch.date } : {}),
    });
  }
  return out;
}

export async function fetchShiniChapter(
  mangaSlug: string,
  num: number,
  displaySlug: string,
  _mangaTitle: string,
): Promise<ChapterData> {
  void displaySlug;
  void _mangaTitle;
  const detail = await fetchKiryuuDetail(mangaSlug);
  const hit = detail.chapters.find((ch) => chapterNum(ch.title) === num);
  if (!hit) {
    throw new KomikuError(
      `Chapter ${num} tidak ditemukan di Kiryuu.`,
      `https://v7.kiryuu.to/manga/${mangaSlug}/`,
      404,
    );
  }
  const path = hit.chapterId ?? hit.url;
  return fetchKiryuuChapter(path);
}

export async function fetchShiniChapterById(
  chapterPath: string,
  _displaySlug: string,
  _mangaTitle: string,
): Promise<ChapterData> {
  void _displaySlug;
  void _mangaTitle;
  return fetchKiryuuChapter(chapterPath);
}

export function normalizeKomikType(raw?: string | null): KomikType | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (/\bmanhwa\b/.test(v)) return "Manhwa";
  if (/\bmanhua\b/.test(v)) return "Manhua";
  if (/\bmanga\b/.test(v)) return "Manga";
  return undefined;
}
