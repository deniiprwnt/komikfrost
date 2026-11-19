/**
 * lib/api/kiryuu.ts â€” adapter sumber Kiryuu (v7.kiryuu.to).
 *
 * Strategi dua jalur:
 *  - WP REST (`/wp-json/wp/v2/*`) untuk daftar, pencarian, genre, media.
 *  - HTML scrape untuk detail (daftar chapter lengkap) dan reader.
 *
 * Gambar: CDN `cdn.kiryuu.io` lewat proxy /api/img.
 * Error dibungkus KomikuError agar route /api/* menanganinya seragam.
 */
import * as cheerio from "cheerio";
import type {
  ChapterData,
  ChapterItem,
  GenreRef,
  KomikType,
  MangaCard,
  MangaDetail,
  PagedResult,
} from "./types";
import { proxiedImage } from "./img-proxy";
import { withDataVersion } from "./cache";
import { blockText, cleanSynopsis } from "./text";
import { canonicalGenre } from "./genre-canonical";
import { chapterNum } from "./aggregator";
import { aliasKeys } from "./aggregator";
import { KomikuError } from "./komiku";

const KIRYUU_BASE = "https://v7.kiryuu.to";
const KIRYUU_WP = KIRYUU_BASE + "/wp-json/wp/v2";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function fetchText(url: string, revalidate = 120, fresh = false): Promise<string> {
  const target = withDataVersion(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Accept: "text/html,application/json", Referer: KIRYUU_BASE + "/" },
      signal: ctrl.signal,
    };
    if (fresh) init.cache = "no-store";
    else init.next = { revalidate };
    res = await fetch(target, init);
  } catch (e) {
    throw new KomikuError(
      e instanceof DOMException && e.name === "AbortError"
        ? "Kiryuu terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke Kiryuu. Coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new KomikuError(`Kiryuu merespons dengan status ${res.status}.`, url, res.status);
  }
  return res.text();
}

async function fetchWp<T>(url: string, revalidate = 120, fresh = false): Promise<T> {
  const target = withDataVersion(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: KIRYUU_BASE + "/" },
      signal: ctrl.signal,
    };
    if (fresh) init.cache = "no-store";
    else init.next = { revalidate };
    res = await fetch(target, init);
  } catch (e) {
    throw new KomikuError(
      e instanceof DOMException && e.name === "AbortError"
        ? "Kiryuu terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke Kiryuu. Coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new KomikuError(`Kiryuu merespons dengan status ${res.status}.`, url, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new KomikuError("Respons Kiryuu tidak valid.", url, res.status);
  }
}

/* ------------------------------------------------------------------ */
/* Tipe WP REST                                                        */
/* ------------------------------------------------------------------ */

interface WpMedia {
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url?: string }> };
}

interface WpTerm {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
  count?: number;
}

interface WpManga {
  id: number;
  slug: string;
  title: { rendered: string };
  modified_gmt?: string;
  "manga-type"?: number[];
  "manga-status"?: number[];
  genre?: number[];
  featured_media?: number;
  excerpt?: { rendered: string };
  content?: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: WpMedia[];
    "wp:term"?: WpTerm[][];
  };
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function decodeEntities(s: string): string {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "â€“")
    .replace(/&#8212;/g, "â€”")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "â€¦");
}

function normalizeType(raw?: string | null): KomikType | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (/\bmanhwa\b/.test(v)) return "Manhwa";
  if (/\bmanhua\b/.test(v)) return "Manhua";
  if (/\bmanga\b/.test(v)) return "Manga";
  return undefined;
}

function termsByTaxonomy(m: WpManga): Map<string, WpTerm[]> {
  const out = new Map<string, WpTerm[]>();
  const groups = m._embedded?.["wp:term"] ?? [];
  for (const arr of groups) {
    for (const t of arr) {
      if (!t?.taxonomy) continue;
      const list = out.get(t.taxonomy) ?? [];
      list.push(t);
      out.set(t.taxonomy, list);
    }
  }
  return out;
}

function coverFrom(m: WpManga): string {
  const media = m._embedded?.["wp:featuredmedia"]?.[0];
  const raw = media?.source_url ?? media?.media_details?.sizes?.large?.source_url;
  return raw ? proxiedImage(raw) : "";
}

function coverCandidatesFrom(m: WpManga): string[] {
  const out: string[] = [];
  const push = (u?: string) => {
    if (!u) return;
    const p = proxiedImage(u);
    if (p && !out.includes(p)) out.push(p);
  };
  const media = m._embedded?.["wp:featuredmedia"]?.[0];
  if (media) {
    push(media.source_url);
    const sizes = media.media_details?.sizes ?? {};
    for (const key of ["large", "full", "medium_large"]) {
      const s = sizes[key]?.source_url;
      if (s) push(s);
    }
  }
  return out;
}

function toCard(m: WpManga): MangaCard {
  const terms = termsByTaxonomy(m);
  const typeTerm = terms.get("manga-type")?.[0];
  const type = normalizeType(typeTerm?.name) ?? undefined;
  const genreTerms = terms.get("genre") ?? [];
  const genre = genreTerms.length
    ? canonicalGenre(genreTerms[0].name)?.name ?? genreTerms[0].name
    : undefined;
  const title = decodeEntities(m.title?.rendered ?? "").trim();
  const synopsisText = cleanSynopsis(decodeEntities(m.excerpt?.rendered ?? ""));
  const ts = m.modified_gmt ? Date.parse(m.modified_gmt) : NaN;
  const cover = coverFrom(m);
  const cands = coverCandidatesFrom(m);
  return {
    slug: m.slug,
    title,
    thumbnail: cover,
    ...(cands.length > 1 ? { thumbnailCandidates: cands } : {}),
    ...(type ? { type } : {}),
    ...(genre ? { genre } : {}),
    ...(Number.isFinite(ts) ? { updatedAtTs: ts } : {}),
    ...(synopsisText ? { synopsis: synopsisText } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* List / ranking / search                                             */
/* ------------------------------------------------------------------ */

const WP_EMBED = "_embed=wp:featuredmedia,wp:term";

function wpListUrl(page: number, pageSize: number, extra: string): string {
  const p = Math.max(1, page);
  return `${KIRYUU_WP}/manga?${extra}&orderby=modified&order=desc&per_page=${pageSize}&page=${p}&${WP_EMBED}`;
}

export async function fetchKiryuuLatest(
  page = 1,
  opts: { pageSize?: number; fresh?: boolean } = {},
): Promise<PagedResult<MangaCard>> {
  const pageSize = opts.pageSize ?? 24;
  const url = wpListUrl(page, pageSize, "status=publish");
  try {
    const arr = await fetchWp<WpManga[]>(url, 60, opts.fresh === true);
    const items = Array.isArray(arr) ? arr.map(toCard) : [];
    return { items, hasNextPage: items.length >= pageSize };
  } catch (e) {
    if ((e as KomikuError).status === 400) return { items: [], hasNextPage: false };
    throw e;
  }
}

export async function searchKiryuuRemote(
  keyword: string,
  page = 1,
  pageSize = 20,
): Promise<PagedResult<MangaCard>> {
  const kw = keyword.trim();
  if (kw.length < 2) return { items: [], hasNextPage: false };
  const p = Math.max(1, page);
  const url = `${KIRYUU_WP}/manga?search=${encodeURIComponent(kw)}&per_page=${pageSize}&page=${p}&${WP_EMBED}`;
  try {
    const arr = await fetchWp<WpManga[]>(url, 60);
    const items = Array.isArray(arr) ? arr.map(toCard) : [];
    return { items, hasNextPage: items.length >= pageSize };
  } catch (e) {
    if ((e as KomikuError).status === 400) return { items: [], hasNextPage: false };
    throw e;
  }
}

/** Tidak ada endpoint rekomendasi; pakai subset latest. */
export async function fetchKiryuuRecommended(pageSize = 24): Promise<MangaCard[]> {
  const r = await fetchKiryuuLatest(1, { pageSize });
  return r.items;
}

/** Tidak ada endpoint popular; pakai subset latest (dedupe dengan Komiku di UI). */
export async function fetchKiryuuTop(pageSize = 10): Promise<MangaCard[]> {
  const r = await fetchKiryuuLatest(1, { pageSize });
  return r.items;
}

/* ------------------------------------------------------------------ */
/* Genre                                                               */
/* ------------------------------------------------------------------ */

export async function fetchKiryuuGenres(): Promise<GenreRef[]> {
  const url = `${KIRYUU_WP}/genre?per_page=100&orderby=count&order=desc`;
  try {
    const arr = await fetchWp<WpTerm[]>(url, 3600);
    if (!Array.isArray(arr)) return [];
    const out: GenreRef[] = [];
    const seen = new Set<string>();
    for (const t of arr) {
      if (!t.slug || !t.name) continue;
      const canon = canonicalGenre(t.name);
      const slug = canon?.slug ?? t.slug;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        name: canon?.name ?? t.name,
        slug,
        ...(typeof t.count === "number" ? { count: t.count } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchKiryuuByGenre(
  genreSlug: string,
  page = 1,
  pageSize = 24,
): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const url = `${KIRYUU_WP}/manga?genre=${encodeURIComponent(genreSlug)}&orderby=modified&order=desc&per_page=${pageSize}&page=${p}&${WP_EMBED}`;
  try {
    const arr = await fetchWp<WpManga[]>(url, 120);
    const items = Array.isArray(arr) ? arr.map(toCard) : [];
    return { items, hasNextPage: items.length >= pageSize };
  } catch (e) {
    if ((e as KomikuError).status === 400) return { items: [], hasNextPage: false };
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Detail (HTML scrape untuk daftar chapter lengkap)                   */
/* ------------------------------------------------------------------ */

function absUrl(src: string | undefined): string {
  if (!src) return "";
  const s = src.trim();
  if (!s || s.startsWith("data:")) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http")) return s;
  return KIRYUU_BASE + (s.startsWith("/") ? s : "/" + s);
}

function chapterSlugFromHref(href: string, mangaSlug: string): { label: string; token: string } | null {
  const prefix = `/manga/${mangaSlug}/chapter-`;
  const idx = href.indexOf(prefix);
  if (idx < 0) return null;
  const tail = href.slice(idx + prefix.length).replace(/\/+$/, "");
  // Format Kiryuu: <num>.<postid> di mana <num> BOLEH mengandung titik
  // (mis. "1.5.147631" = chapter 1.5, postid 147631). Pisahkan pada titik
  // TERAKHIR.
  const lastDot = tail.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const num = tail.slice(0, lastDot);
  if (!/^\d+(?:\.\d+)*$/.test(num)) return null;
  const postid = tail.slice(lastDot + 1);
  if (!/^\d+$/.test(postid)) return null;
  return { label: `Chapter ${num}`, token: `${num}.${postid}` };
}

export async function fetchKiryuuDetail(slug: string): Promise<MangaDetail> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const html = await fetchText(`${KIRYUU_BASE}/manga/${encodeURIComponent(clean)}/`, 300);
  const $ = cheerio.load(html);

  const title = decodeEntities($("h1").first().text().trim());
  if (!title) {
    throw new KomikuError(`Kiryuu: tidak dapat membaca halaman ${clean}.`, `${KIRYUU_BASE}/manga/${clean}/`);
  }

  const coverCandidates: string[] = [];
  $("img").each((_, el) => {
    const src = absUrl($(el).attr("src") || $(el).attr("data-src") || "");
    if (!src) return;
    if (/logo-kiryuu|gravatar|banner-iklan|anime-|IDKS\.gif/i.test(src)) return;
    if (/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.(jpe?g|png|webp)$/i.test(src) && !coverCandidates.includes(src)) {
      coverCandidates.push(src);
    }
  });
  const cover = coverCandidates[0] ? proxiedImage(coverCandidates[0]) : "";
  const coverProxied = coverCandidates.map((u) => proxiedImage(u)).filter(Boolean);

  const info: Record<string, string> = {};
  $("h4").each((_, el) => {
    const key = $(el).text().trim().toLowerCase();
    if (!key || info[key]) return;
    const parent = $(el).parent();
    const text = blockText($, parent).trim();
    const value = text.replace(new RegExp("^" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i"), "").trim();
    if (value) info[key] = value;
  });

  const synopsis = cleanSynopsis($('[itemprop="description"]').first().text()) ?? "";

  const genres: GenreRef[] = [];
  const seenGenre = new Set<string>();
  $('a[href*="/genre/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const name = $(el).text().trim();
    const m = href.match(/\/genre\/([^/]+)\/?/);
    if (!m || !name) return;
    const slug = m[1];
    if (seenGenre.has(slug)) return;
    seenGenre.add(slug);
    const canon = canonicalGenre(name);
    genres.push({ name: canon?.name ?? name, slug: canon?.slug ?? slug });
  });

  const chapters: ChapterItem[] = [];
  const seenCh = new Set<string>();
  $('a[href*="/chapter-"]').each((_, el) => {
    const raw = ($(el).attr("href") || "").trim();
    if (!raw) return;
    const href = raw.startsWith("http") ? raw : KIRYUU_BASE + (raw.startsWith("/") ? raw : "/" + raw);
    const parsed = chapterSlugFromHref(href, clean);
    if (!parsed || seenCh.has(parsed.token)) return;
    seenCh.add(parsed.token);
    chapters.push({
      title: parsed.label,
      url: `/manga/${clean}/chapter-${parsed.token}/`,
      // chapterId menyimpan path lengkap â†’ reader (chapter.ts) bisa langsung
      // memanggil fetchKiryuuChapter tanpa scrape detail kedua kali.
      chapterId: `/manga/${clean}/chapter-${parsed.token}/`,
    });
  });
  chapters.sort((a, b) => {
    const na = chapterNum(a.title);
    const nb = chapterNum(b.title);
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
    return 0;
  });
  const first = chapters[chapters.length - 1];
  const latest = chapters[0];

  const type = normalizeType(info["type"]);
  const status = info["status"];
  const author = info["author"] || info["artist"];

  return {
    slug: clean,
    title,
    cover: cover || "",
    ...(coverProxied.length > 1 ? { coverCandidates: coverProxied } : {}),
    synopsis,
    ...(type ? { type } : {}),
    genres,
    ...(author ? { author } : {}),
    ...(status ? { status } : {}),
    ...(first ? { firstChapter: { label: first.title, url: first.url } } : {}),
    ...(latest ? { latestChapter: { label: latest.title, url: latest.url } } : {}),
    chapters,
  };
}

/* ------------------------------------------------------------------ */
/* Resolusi berdasarkan judul / alias                                  */
/* ------------------------------------------------------------------ */

export async function findKiryuuSlugByTitles(
  titles: ReadonlyArray<string | null | undefined>,
): Promise<string | null> {
  const want = aliasKeys(...titles);
  if (want.length === 0) return null;
  const queries: string[] = [];
  for (const raw of titles) {
    const q = (raw ?? "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (q.length >= 2 && !queries.includes(q)) queries.push(q);
  }
  let ok = 0;
  let lastErr: unknown;
  for (const q of queries.slice(0, 4)) {
    try {
      const { items } = await searchKiryuuRemote(q, 1, 10);
      ok++;
      const hit = items.find((it) => aliasKeys(it.title, it.altTitle).some((k) => want.includes(k)));
      if (hit) return hit.slug;
    } catch (e) {
      lastErr = e;
    }
  }
  if (ok === 0 && lastErr) throw lastErr;
  return null;
}

export async function resolveKiryuuDetailForSlug(
  slugOrTitle: string,
  altTitle?: string,
): Promise<MangaDetail> {
  const clean = slugOrTitle.replace(/^\/+|\/+$/g, "");
  // Slug Kiryuu biasanya sama dengan slug Komiku â€” coba langsung dulu.
  try {
    return await fetchKiryuuDetail(clean);
  } catch (e) {
    // 404 = slug beda; coba lewat judul.
    if ((e as KomikuError).status !== 404) throw e;
  }
  const alias = await findKiryuuSlugByTitles([
    clean.replace(/-/g, " "),
    altTitle,
  ]);
  if (alias) return fetchKiryuuDetail(alias);
  throw new KomikuError(`Tidak ditemukan di Kiryuu: ${clean}.`, KIRYUU_BASE, 404);
}

/* ------------------------------------------------------------------ */
/* Meta ringan (genre/tipe/sinopsis) via WP REST                       */
/* ------------------------------------------------------------------ */

export interface KiryuuBrief {
  id: string;
  title: string;
  altTitle?: string;
  type?: KomikType;
  genres: GenreRef[];
  synopsis?: string;
  cover: string;
}

export async function fetchKiryuuMeta(slug: string): Promise<KiryuuBrief> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const url = `${KIRYUU_WP}/manga?slug=${encodeURIComponent(clean)}&${WP_EMBED}`;
  const arr = await fetchWp<WpManga[]>(url, 3600);
  const m = arr[0];
  if (!m) throw new KomikuError(`Kiryuu: tidak menemukan ${clean}.`, url, 404);
  const terms = termsByTaxonomy(m);
  const type = normalizeType(terms.get("manga-type")?.[0]?.name);
  const genreList: GenreRef[] = [];
  const seen = new Set<string>();
  for (const t of terms.get("genre") ?? []) {
    const canon = canonicalGenre(t.name);
    const s = canon?.slug ?? t.slug;
    if (seen.has(s)) continue;
    seen.add(s);
    genreList.push({ name: canon?.name ?? t.name, slug: s });
  }
  const synopsis = cleanSynopsis(decodeEntities(m.excerpt?.rendered ?? ""));
  const title = decodeEntities(m.title?.rendered ?? "").trim();
  return {
    id: m.slug,
    title,
    ...(type ? { type } : {}),
    genres: genreList,
    ...(synopsis ? { synopsis } : {}),
    cover: coverFrom(m),
  };
}

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */

/** Terima path lengkap `/manga/<slug>/chapter-<num>.<postid>/` (dari daftar chapter). */
export async function fetchKiryuuChapter(chapterPath: string): Promise<ChapterData> {
  const clean = chapterPath.replace(/^\/+|\/+$/g, "");
  const m = clean.match(/^manga\/([^/]+)\/chapter-([\d.]+)\.(\d+)$/);
  if (!m) {
    throw new KomikuError("Path chapter Kiryuu tidak valid.", chapterPath);
  }
  const [, mangaSlug, numStr] = m;
  const chapterLabel = `Chapter ${numStr}`;
  const html = await fetchText(`${KIRYUU_BASE}/${clean}/`, 300);
  const $ = cheerio.load(html);

  // Gambar reader: SEMUA `cdn.kiryu.io/...` adalah halaman chapter.
  // Path bervariasi per judul: `ycdn/imgsc/e/<slug>/<num>/N.jpg`,
  // `kuma/<slug>/chapter-N/N.jpg`, `E/<slug>/<num>/N.jpg`,
  // `<slug>/<num>/N.jpg`, `<slug>/chapter-N/N.jpg`.
  // Non-gambar (logo, banner iklan, gravatar, cover) memakai host LAIN
  // (`v7.kiryu.to/wp-content`, `blogger.googleusercontent.com`,
  // `i.88cdn.cloud`) sehingga cukup menyaring pada host CDN saja.
  const images: string[] = [];
  $("img").each((_, el) => {
    const src = absUrl($(el).attr("src") || $(el).attr("data-src") || "");
    if (!src) return;
    if (!/^https?:\/\/cdn\.kiryuu\.io\//i.test(src)) return;
    if (/\/(?:logo|banner|ads?|sponsor)\b/i.test(src)) return;
    const proxied = proxiedImage(src);
    if (proxied && !images.includes(proxied)) images.push(proxied);
  });

  if (images.length === 0) {
    throw new KomikuError(
      "Halaman chapter Kiryuu tidak memuat gambar yang dikenali.",
      `${KIRYUU_BASE}/${clean}/`,
    );
  }

  const h1 = decodeEntities($("h1").first().text().trim());
  const titleTag = decodeEntities($("title").first().text().trim());
  const mangaTitleFromTitle = titleTag.match(/^Baca\s+(.+?)\s+Bahasa/i)?.[1]?.trim() ?? "";
  // h1 di halaman reader Kiryuu kadang sudah berisi label chapter
  // ("Baca Eleceed Chapter 1 Bahasa Indonesia Chapter 1"); buang bila begitu
  // agar tidak tergabung dua kali di title reader.
  const stripChapterTail = (s: string): string => s.replace(/\s+Chapter\s+[\d.]+\s*$/i, "").trim();
  const mangaTitle = stripChapterTail(h1) || mangaTitleFromTitle;

  let prevUrl: string | undefined;
  let nextUrl: string | undefined;
  const self = `/${clean}/`;
  $('a[href*="/chapter-"]').each((_, el) => {
    const raw = ($(el).attr("href") || "").trim();
    if (!raw) return;
    const href = raw.startsWith("http") ? raw : KIRYUU_BASE + (raw.startsWith("/") ? raw : "/" + raw);
    let path: string;
    try {
      path = new URL(href).pathname;
    } catch {
      return;
    }
    if (path === self) return;
    const id = $(el).attr("id") || "";
    const rel = ($(el).attr("rel") || "").toLowerCase();
    const text = $(el).text().trim().toLowerCase();
    if (id === "previous-chapter" || id === "prev" || rel === "prev" || text === "prev") prevUrl = prevUrl ?? path;
    if (id === "next-chapter" || id === "next" || rel === "next" || text === "next") nextUrl = nextUrl ?? path;
  });

  return {
    title: mangaTitle ? `${mangaTitle} ${chapterLabel}`.trim() : chapterLabel,
    mangaSlug,
    chapterLabel,
    images,
    ...(prevUrl ? { prevUrl } : {}),
    ...(nextUrl ? { nextUrl } : {}),
    mangaUrl: `/komik/${mangaSlug}`,
  };
}
