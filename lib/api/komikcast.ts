/**
 * Lapisan HTTP + parsing JSON Komikcast (`komikcast.top`).
 *
 * Sumber (official JSON API, dipakai frontendnya sendiri):
 * - GET /api/v1/search?q=<kw>&page=<n>      hasil pencarian (data[])
 * - GET /api/v1/series/<slug>               metadata + latest_chapter + chapters[]
 * - GET /api/v1/series/<slug>/chapters?order=asc&per_page=100&page=<n>
 *                                           daftar chapter lengkap (Laravel paginator)
 * - GET /api/v1/chapters/<chapter-slug>      detail chapter: pages[], prev/next
 * - GET /api/v1/home                         hero/trending/latest_comic (opsional)
 *
 * Bentuk return SAMA dengan adapter lain (MangaCard[] / MangaDetail /
 * ChapterData) agar route /api/* dan frontend tidak berubah.
 * Semua fetch server-side (dari route /api/*), tanpa bypass/CAPTCHA/
 * autentikasi apa pun. Cache singkat via `next.revalidate` seperti Komiku.
 */

import type {
  ChapterData,
  ChapterItem,
  ChapterRef,
  GenreRef,
  KomikType,
  MangaCard,
  MangaDetail,
  PagedResult,
} from "./types";

const KC_BASE = "https://komikcast.top";
const KC_API = "https://komikcast.top/api/v1";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class KomikcastError extends Error {
  source: string;
  status?: number;
  constructor(message: string, source: string, status?: number) {
    super(message);
    this.name = "KomikcastError";
    this.source = source;
    this.status = status;
  }
  toJSON() {
    return { message: this.message, source: this.source, status: this.status };
  }
}

async function fetchJson<T>(url: string, revalidate = 30, fresh = false): Promise<T> {
  const ctrl = new AbortController();
  // Gagal cepat (8 dtk, dulu 12): merge menunggu source terlambat.
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: KC_BASE + "/" },
      signal: ctrl.signal,
    };
    // `fresh` = probe live: lewati cache HTTP Next.
    if (fresh) init.cache = "no-store";
    else init.next = { revalidate };
    res = await fetch(url, init);
  } catch (e) {
    throw new KomikcastError(
      e instanceof DOMException && e.name === "AbortError"
        ? "Sumber data terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke sumber data. Periksa koneksi internet lalu coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new KomikcastError(
      `Sumber data merespons dengan status ${res.status} untuk halaman ini.`,
      url,
      res.status,
    );
  }
  // Upstream kadang 200 OK tapi body bukan JSON (halaman error HTML,
  // challenge, dsb.). Bungkus sebagai KomikcastError agar handler route
  // mengembalikan 502 "upstream", bukan 500 "terjadi kesalahan tak terduga".
  try {
    return (await res.json()) as T;
  } catch {
    throw new KomikcastError("Respons sumber data tidak valid.", url, res.status);
  }
}

/* ------------------------------------------------------------------ */
/* Tipe mentah API Komikcast                                           */
/* ------------------------------------------------------------------ */

interface KcSeries {
  id: number;
  slug: string;
  title: string;
  title_english?: string | null;
  type?: string;
  status?: string;
  year?: number;
  score?: number;
  synopsis?: string;
  poster_url?: string;
  genres?: { slug: string; name: string }[];
  latest_chapter?: { slug: string; number: number; number_label: string } | null;
  chapter_count_available?: string | number;
  updated_at?: string;
}

interface KcChapterRow {
  id: number;
  slug: string;
  series_id: number;
  number: number;
  number_label: string;
  title: string;
  published_at?: string;
}

interface KcChapterDetail {
  id: number;
  slug: string;
  series_id: number;
  number: number;
  number_label: string;
  title: string;
  pages: string[];
  page_count: number;
  series?: { slug: string; title: string; poster_url?: string; type?: string; status?: string };
}

/* ------------------------------------------------------------------ */
/* Konversi → tipe KomikFrost                                          */
/* ------------------------------------------------------------------ */

function normalizeType(raw?: string): KomikType | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "manga") return "Manga";
  if (v === "manhwa") return "Manhwa";
  if (v === "manhua") return "Manhua";
  return undefined;
}

/** "2 jam lalu" dari ISO updated_at (fallback updatedAt kartu). */
export function timeAgoId(iso?: string): string | undefined {
  if (!iso) return undefined;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return undefined;
  const u: [number, string][] = [
    [31536000, "tahun"],
    [2592000, "bulan"],
    [604800, "minggu"],
    [86400, "hari"],
    [3600, "jam"],
    [60, "menit"],
  ];
  for (const [k, w] of u) if (s >= k) return `${Math.floor(s / k)} ${w} lalu`;
  return "baru saja";
}

/** "2026-09-27T10:38:44+00:00" → "27/09/2026" (label tanggal chapter). */
function fmtDateId(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function toCard(s: KcSeries): MangaCard {
  const latest: ChapterRef | undefined = s.latest_chapter
    ? {
        label: s.latest_chapter.number_label || `Chapter ${s.latest_chapter.number}`,
        url: `/${s.latest_chapter.slug}/`,
      }
    : undefined;
  // Tebakan chapter AWAL (pola sama seperti kartu Shinigami). Nomor pertama
  // dihitung dari latest_chapter − chapter_count_available bila keduanya
  // ada (katalog sering mulai dari tengah, mis. latest 57 dari 5 bab → 53);
  // fallback Chapter 1. Reader tetap resolve via daftar gabungan (nomor
  // asli dipakai; tebakan meleset = sumber itu dilewati, bukan error).
  const first: ChapterRef | undefined = s.latest_chapter
    ? (() => {
        const latestNum = s.latest_chapter?.number;
        const cnt = parseInt(String(s.chapter_count_available ?? ""), 10);
        const firstNum =
          Number.isFinite(latestNum) && Number.isFinite(cnt) && cnt > 0 && cnt <= latestNum
            ? Math.max(1, latestNum - cnt + 1)
            : 1;
        return { label: `Chapter ${firstNum}`, url: `/${s.slug}-chapter-${firstNum}-bahasa-indonesia/` };
      })()
    : undefined;
  const genreOne = (s.genres ?? []).find((g) => g?.name || g?.slug);
  const ts = s.updated_at ? Date.parse(s.updated_at) : NaN;
  return {
    slug: s.slug,
    title: s.title,
    ...(s.title_english ? { altTitle: s.title_english } : {}),
    thumbnail: s.poster_url ?? "",
    ...(normalizeType(s.type) ? { type: normalizeType(s.type)! } : {}),
    ...(genreOne ? { genre: genreOne.name || genreOne.slug } : {}),
    ...(s.synopsis ? { synopsis: s.synopsis } : {}),
    ...(timeAgoId(s.updated_at) ? { updatedAt: timeAgoId(s.updated_at)! } : {}),
    ...(Number.isFinite(ts) ? { updatedAtTs: ts } : {}),
    ...(first ? { firstChapter: first } : {}),
    ...(latest ? { latestChapter: latest } : {}),
  };
}

function toChapterItem(r: KcChapterRow): ChapterItem {
  return {
    title: r.number_label || `Chapter ${r.number}`,
    url: `/${r.slug}/`,
    ...(fmtDateId(r.published_at) ? { date: fmtDateId(r.published_at)! } : {}),
  };
}

function toGenres(raw?: { slug: string; name: string }[]): GenreRef[] {
  return (raw ?? [])
    .filter((g) => g?.slug)
    .map((g) => ({ name: g.name || g.slug, slug: g.slug.toLowerCase() }));
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/** Cari komik di Komikcast (`/api/v1/search?q=&page=`). Page JSON ~40 item. */
export async function searchKomikcastRemote(
  keyword: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  const kw = keyword.trim();
  if (!kw) return { items: [], hasNextPage: false };
  const p = Math.max(1, page);
  const url = `${KC_API}/search?q=${encodeURIComponent(kw)}&page=${p}`;
  const json = await fetchJson<{ data: KcSeries[] }>(url);
  const items = (json.data ?? []).map(toCard);
  // API tidak memberi meta paginator pada search — halaman penuh (~40)
  // diasumsikan masih ada lanjutannya (pola sama seperti sumber lain).
  return { items, hasNextPage: items.length >= 40 };
}

/* ------------------------------------------------------------------ */
/* Detail + chapter list                                               */
/* ------------------------------------------------------------------ */

/** Ambil SEMUA halaman chapter (`per_page=100`, ikuti last_page). */
async function fetchKcChaptersAll(slug: string): Promise<KcChapterRow[]> {
  const out: KcChapterRow[] = [];
  let page = 1;
  // Batas aman: 50 halaman × 100 = 5000 chapter (terjauh di atas katalog nyata).
  for (; page <= 50; page++) {
    const url = `${KC_API}/series/${encodeURIComponent(slug)}/chapters?order=asc&per_page=100&page=${page}`;
    const json = await fetchJson<{ data: KcChapterRow[]; meta?: { last_page?: number } }>(url);
    out.push(...(json.data ?? []));
    const last = json.meta?.last_page ?? 1;
    if (page >= last) break;
  }
  return out;
}

/** Detail satu komik (`/api/v1/series/<slug>` + chapter list lengkap). */
export async function fetchKomikcastDetail(slug: string): Promise<MangaDetail> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const json = await fetchJson<{ data: KcSeries }>(`${KC_API}/series/${encodeURIComponent(clean)}`);
  const s = json.data;
  if (!s?.slug) throw new KomikcastError("Detail Komikcast tidak ditemukan.", `${KC_API}/series/${clean}`);

  const rows = await fetchKcChaptersAll(s.slug);
  const chapters = rows
    .map(toChapterItem)
    .sort((a, b) => {
      // Nomor tertinggi dulu (konsisten dengan mergeChapters).
      const na = parseFloat(a.title.replace(/^(chapter|ch\.?)\s*/i, ""));
      const nb = parseFloat(b.title.replace(/^(chapter|ch\.?)\s*/i, ""));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return 0;
    });

  const latestRow = rows.length > 0 ? rows.reduce((m, r) => (r.number > m.number ? r : m), rows[0]) : undefined;
  const latest: ChapterRef | undefined = latestRow
    ? { label: latestRow.number_label || `Chapter ${latestRow.number}`, url: `/${latestRow.slug}/` }
    : undefined;
  const firstRow = rows.length > 0 ? rows.reduce((m, r) => (r.number < m.number ? r : m), rows[0]) : undefined;
  const first: ChapterRef | undefined = firstRow
    ? { label: firstRow.number_label || `Chapter ${firstRow.number}`, url: `/${firstRow.slug}/` }
    : undefined;

  return {
    slug: s.slug,
    title: s.title,
    ...(s.title_english ? { altTitle: s.title_english } : {}),
    cover: s.poster_url ?? "",
    synopsis: s.synopsis ?? "",
    ...(s.type ? { type: s.type } : {}),
    genres: toGenres(s.genres),
    ...(s.status ? { status: s.status } : {}),
    ...(typeof s.score === "number" ? { rating: String(s.score) } : {}),
    ...(first ? { firstChapter: first } : {}),
    ...(latest ? { latestChapter: latest } : {}),
    chapters,
  };
}

/**
 * Ringkasan ringan satu series Komikcast (HANYA `/api/v1/series/<slug>`,
 * tanpa daftar chapter). Dipakai untuk melengkapi kartu yang datang dari
 * `/api/v1/home`: endpoint itu mengirim `latest_comic` TANPA `genres`,
 * sehingga kartu komikcast-only tampil tanpa genre walau series-nya punya.
 */
export interface KcBrief {
  title?: string;
  cover?: string;
  genre?: string;
  type?: KomikType;
  synopsis?: string;
}

/** Genre/tipe/sinopsis satu series — praktis tidak berubah, jadi disimpan
 *  6 jam. Tanpa cache, melengkapi 24 kartu /home = 24 request tiap scrape. */
const KC_BRIEF_TTL = 6 * 60 * 60_000;
const kcBriefCache = new Map<string, { at: number; brief: KcBrief }>();

export async function fetchKomikcastBrief(slug: string): Promise<KcBrief> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const hit = kcBriefCache.get(clean);
  if (hit && Date.now() - hit.at < KC_BRIEF_TTL) return hit.brief;
  const json = await fetchJson<{ data: KcSeries }>(`${KC_API}/series/${encodeURIComponent(clean)}`);
  const s = json.data;
  if (!s?.slug) throw new KomikcastError("Ringkasan Komikcast tidak ditemukan.", `${KC_API}/series/${clean}`);
  const g = (s.genres ?? []).find((x) => x?.name || x?.slug);
  const type = normalizeType(s.type);
  const brief: KcBrief = {
    ...(s.title ? { title: s.title } : {}),
    ...(s.poster_url ? { cover: s.poster_url } : {}),
    ...(g ? { genre: g.name || g.slug } : {}),
    ...(type ? { type } : {}),
    ...(s.synopsis ? { synopsis: s.synopsis } : {}),
  };
  kcBriefCache.set(clean, { at: Date.now(), brief });
  if (kcBriefCache.size > 1000) {
    const oldest = kcBriefCache.keys().next().value;
    if (oldest !== undefined) kcBriefCache.delete(oldest);
  }
  return brief;
}

/**
 * Lengkapi genre/tipe kartu yang lahir dari endpoint ringkas `/api/v1/home`
 * (`latest_comic` & `trending` TIDAK membawa `genres`). Dulu pengisian hanya
 * dilakukan agregator untuk maks 6 kartu dengan batas waktu 2,5 dtk — kartu
 * Komikcast di luar jatah itu tetap tanpa genre.
 * Paralel berbatas (6 worker) + cache 6 jam per slug, jadi scrape berikutnya
 * praktis tanpa request tambahan.
 */
function kcBriefFromCache(slug: string): KcBrief | undefined {
  const hit = kcBriefCache.get(slug);
  return hit && Date.now() - hit.at < KC_BRIEF_TTL ? hit.brief : undefined;
}

async function fillKcMeta(
  cards: MangaCard[],
  opts: { budgetMs?: number; cacheOnly?: boolean } = {},
): Promise<void> {
  const needy = cards.filter((c) => !c.genre && c.slug);
  if (needy.length === 0) return;
  const apply = (c: MangaCard, b: KcBrief): void => {
    if (b.genre) c.genre = b.genre;
    if (!c.type && b.type) c.type = b.type;
    if (!c.synopsis && b.synopsis) c.synopsis = b.synopsis;
  };
  const deadline = Date.now() + (opts.budgetMs ?? 4_000);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < needy.length && Date.now() < deadline) {
      const c = needy[next++];
      // Mode cache-saja (probe live): pakai yang sudah diketahui, tanpa
      // request baru — supaya daftar hasil probe tidak kehilangan genre
      // yang sudah tampil di layar.
      if (opts.cacheOnly) {
        const b = kcBriefFromCache(c.slug);
        if (b) apply(c, b);
        continue;
      }
      try {
        apply(c, await fetchKomikcastBrief(c.slug));
      } catch {
        // satu gagal = kartu tampil tanpa genre, bukan error
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, needy.length) }, worker));
}

/** Daftar chapter satu komik (via detail, memakai cache yang sama). */
export async function fetchKomikcastChapterList(slug: string): Promise<ChapterItem[]> {
  const d = await fetchKomikcastDetail(slug);
  return d.chapters;
}

/**
 * Update terbaru Komikcast (`/api/v1/home` → latest_comic, max 24 kartu).
 * Dipakai getLatest/getRecommended — tanpa updatedAt valid item dibuang
 * agar tidak mengotori sortByFresh (Infinity = paling belakang).
 */
export async function fetchKomikcastLatest(opts: { fresh?: boolean } = {}): Promise<MangaCard[]> {
  // Revalidate 10 dtk (dulu 30) agar auto-refresh 5 dtk tidak tertahan cache.
  // `fresh` bypass total.
  const json = await fetchJson<{ latest_comic?: KcSeries[] }>(
    `${KC_API}/home`,
    10,
    opts.fresh === true,
  );
  const items = (json.latest_comic ?? []).slice(0, 24).map(toCard);
  // SELALU diisi, termasuk probe `fresh`. Dulu probe memakai mode cache-saja,
  // padahal justru probe inilah jalur utama beranda & /terbaru (live=1) —
  // akibatnya cache tidak pernah terisi dan kartu Komikcast tampil tanpa
  // genre. Cache 6 jam per slug membuat probe berikutnya nyaris tanpa request.
  await fillKcMeta(items);
  return items;
}

/** Trending Komikcast (`/api/v1/home` → trending, max 20 kartu). */
export async function fetchKomikcastTrending(): Promise<MangaCard[]> {
  const json = await fetchJson<{ trending?: KcSeries[] }>(`${KC_API}/home`);
  const items = (json.trending ?? []).slice(0, 20).map(toCard);
  await fillKcMeta(items);
  return items;
}

/* ------------------------------------------------------------------ */
/* Chapter reader                                                      */
/* ------------------------------------------------------------------ */

/**
 * Satu chapter (`/api/v1/chapters/<chapter-slug>`).
 * @param chapterPath path chapter, mis. "/solo-leveling-chapter-180-bahasa-indonesia/"
 */
export async function fetchKomikcastChapter(chapterPath: string): Promise<ChapterData> {
  const clean = chapterPath.replace(/^\/+|\/+$/g, "");
  const json = await fetchJson<{ data: KcChapterDetail; prev?: { slug: string } | null; next?: { slug: string } | null }>(
    `${KC_API}/chapters/${encodeURIComponent(clean)}`,
  );
  const d = json.data;
  if (!d?.slug) throw new KomikcastError("Chapter Komikcast tidak ditemukan.", `${KC_API}/chapters/${clean}`);
  // Hanya content images (pages resmi API) — tanpa logo/iklan/banner.
  const images = (d.pages ?? []).filter((u) => typeof u === "string" && u.startsWith("http"));
  const seriesSlug = d.series?.slug ?? "";
  return {
    title: d.title || d.number_label || `Chapter ${d.number}`,
    mangaSlug: seriesSlug,
    chapterLabel: d.number_label || `Chapter ${d.number}`,
    images,
    ...(json.prev?.slug ? { prevUrl: `/${json.prev.slug}/` } : {}),
    ...(json.next?.slug ? { nextUrl: `/${json.next.slug}/` } : {}),
    mangaUrl: seriesSlug ? `/${seriesSlug}/` : "",
  };
}

/**
 * Resolve via judul (dipakai agregator saat slug Komiku/Shinigami tidak
 * dikenal Komikcast): search → exact match ternormalisasi → detail.
 * Kandidat dari bersih (kupas ekor "-id") ke mentah, tanpa fuzzy.
 * AltTitle (EN) ikut dicoba: judul utama Komikcast kadang beda ejaan
 * satu-dua huruf dari judul source lain ("...Desu" vs "...Des") tapi
 * judul EN-nya identik dengan alternative_title Shinigami.
 */
export async function resolveKomikcastDetailForTitle(
  rawTitle: string,
  norm: (s: string) => string,
  altTitle?: string,
): Promise<MangaDetail> {
  const base = rawTitle.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const cands: string[] = [];
  for (const v of [base.replace(/\s+id\s*\d*$/i, "").trim(), base]) {
    if (v && !cands.includes(v)) cands.push(v);
  }
  for (const q of cands) {
    const { items } = await searchKomikcastRemote(q, 1);
    const target = norm(q);
    const hit = items.find((c) => norm(c.title) === target);
    if (hit) return fetchKomikcastDetail(hit.slug);
    // Jembatan altTitle: EN Komikcast == EN/alt sisi lain (exact).
    if (altTitle) {
      const normAlt = norm(altTitle);
      const hitAlt = items.find((c) => c.altTitle && norm(c.altTitle) === normAlt);
      if (hitAlt) return fetchKomikcastDetail(hitAlt.slug);
    }
  }
  throw new KomikcastError(`Tidak ditemukan di Komikcast: ${rawTitle}.`, `${KC_API}/search`, 404);
}
