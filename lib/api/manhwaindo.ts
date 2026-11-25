/**
 * lib/api/manhwaindo.ts â€” adapter sumber ManhwaIndo (https://manhwaindo.im).
 *
 * Situs ini aplikasi SvelteKit, bukan WordPress: tiap halaman punya endpoint
 * `<path>/__data.json` (format devalue) yang memuat data terstruktur, jadi
 * tidak perlu scrape HTML. Kontrak fungsi sengaja SAMA dengan lib/api/komiku.ts
 * (fetchMangaList, fetchMangaByGenre, searchMangaRemote, fetchRanking,
 * fetchHome, fetchMangaDetail, fetchChapter, fetchGenres) agar lapisan merge
 * dan UI tidak berubah.
 *
 * URL chapter internal memakai pola `/<slug>-chapter-<token>/` (token "62-384388"
 * untuk 62.384388) sehingga chapterPathToRoute tetap menghasilkan
 * /baca/<slug>/<token>.
 *
 * Gambar halaman chapter (imgx-id.gmbr.pro) diblokir Cloudflare untuk fetch
 * server-side, jadi URL-nya dikirim apa adanya (tidak lewat /api/img) dan
 * dimuat langsung oleh browser. Cover (img2.bacamanga.io) tetap lewat proxy.
 */
import { proxiedImage } from "./img-proxy";
import { cleanSynopsis } from "./text";
import { chapterDateFromIso } from "../chapter-date";
import { KomikuError, parseChapterPath } from "./komiku";
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

export { KomikuError, parseChapterPath, mangaSlugFromPath } from "./komiku";

const MI_BASE = "https://manhwaindo.im";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/* ------------------------------------------------------------------ */
/* Decoder devalue (format __data.json SvelteKit)                       */
/* ------------------------------------------------------------------ */

function decodeDevalue(arr: unknown[]): Row {
  const memo = new Map<number, unknown>();
  const hydrate = (i: number): unknown => {
    if (i === -1) return undefined;
    if (i === -2) return NaN;
    if (i === -3) return Infinity;
    if (i === -4) return -Infinity;
    if (i === -5) return -0;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      if (typeof v[0] === "string") {
        // Tipe khusus devalue (Date â†’ string ISO); lainnya dibiarkan.
        return v[0] === "Date" ? v[1] : v;
      }
      const out: unknown[] = [];
      memo.set(i, out);
      for (const x of v) out.push(hydrate(x as number));
      return out;
    }
    const o: Row = {};
    memo.set(i, o);
    for (const k of Object.keys(v as object)) o[k] = hydrate((v as Row)[k]);
    return o;
  };
  return hydrate(0) as Row;
}

interface Fetched {
  node?: Row;
  redirect?: string;
}

async function fetchData(
  path: string,
  opts: { revalidate?: number; fresh?: boolean } = {},
): Promise<Fetched> {
  const url = MI_BASE + path;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Accept: "application/json", Referer: MI_BASE + "/" },
      signal: ctrl.signal,
    };
    if (opts.fresh) init.cache = "no-store";
    else init.next = { revalidate: opts.revalidate ?? 60 };
    res = await fetch(url, init);
  } catch (e) {
    throw new KomikuError(
      e instanceof DOMException && e.name === "AbortError"
        ? "ManhwaIndo terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke ManhwaIndo. Coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new KomikuError(`ManhwaIndo merespons dengan status ${res.status}.`, url, res.status);
  }
  let json: Row;
  try {
    json = (await res.json()) as Row;
  } catch {
    throw new KomikuError("Respons ManhwaIndo tidak valid.", url, res.status);
  }
  if (json?.type === "redirect") return { redirect: String(json.location ?? "") };
  if (json?.type === "error") {
    throw new KomikuError("ManhwaIndo menolak permintaan.", url, Number(json.status) || 500);
  }
  const nodes: Row[] = Array.isArray(json?.nodes) ? json.nodes : [];
  const last = nodes[nodes.length - 1];
  if (last?.type === "error") {
    throw new KomikuError("ManhwaIndo: halaman tidak ditemukan.", url, Number(last.status) || 404);
  }
  if (last?.type !== "data" || !Array.isArray(last.data)) {
    throw new KomikuError("Respons ManhwaIndo tidak memuat data.", url, res.status);
  }
  return { node: decodeDevalue(last.data) };
}

/* ------------------------------------------------------------------ */
/* Helper umum                                                          */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function normalizeType(raw: unknown): KomikType | undefined {
  const v = str(raw).toLowerCase();
  if (v === "manga") return "Manga";
  if (v === "manhwa") return "Manhwa";
  if (v === "manhua") return "Manhua";
  return undefined;
}

/** Token URL chapter: "62.384388" â†’ "62-384388"; param bawaan situs dipakai bila ada. */
function chapterToken(raw: unknown, param?: unknown): string {
  const p = str(param).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (p) return p;
  const m = str(raw).match(/\d+(?:[.,]\d+)*/);
  return m ? m[0].replace(/[.,]/g, "-") : "";
}

const tokenLabel = (tok: string): string => `Chapter ${tok.replace(/-/g, ".")}`;
const chapterUrl = (slug: string, tok: string): string => `/${slug}-chapter-${tok}/`;

/** Label relatif ala Komiku ("5 menit lalu") â€” dihitung dari timestamp absolut. */
function agoLabel(ts: number): string {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  if (d < 365) return `${Math.floor(d / 30)} bulan lalu`;
  return `${Math.floor(d / 365)} tahun lalu`;
}

/** slug â†’ path seri ("/komik/<id>-<slug>"). Diisi dari daftar agar tanpa redirect. */
const seriesPathCache = new Map<string, string>();
function rememberSeries(id: unknown, slug: string): void {
  const n = Number(id);
  if (!slug || !Number.isFinite(n)) return;
  // Jangan menimpa alamat kanonis yang sudah dikoreksi lewat redirect (situs
  // memotong slug panjang di alamat kanonis, jadi `<id>-<slug-penuh>` salah).
  if (seriesPathCache.has(slug)) return;
  if (seriesPathCache.size > 3000) {
    const oldest = seriesPathCache.keys().next().value;
    if (oldest !== undefined) seriesPathCache.delete(oldest);
  }
  seriesPathCache.set(slug, `/komik/${n}-${slug}`);
}

async function seriesPath(slug: string): Promise<string> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (/^\d+-/.test(clean)) return `/komik/${clean}`;
  const hit = seriesPathCache.get(clean);
  if (hit) return hit;
  // Slug tanpa id â†’ situs membalas redirect 301 ke /komik/<id>-<slug>.
  const r = await fetchData(`/komik/${encodeURIComponent(clean)}/__data.json`, { revalidate: 3600 });
  const loc = r.redirect ?? "";
  if (loc.startsWith("/komik/")) {
    const path = loc.replace(/\/+$/, "").split("?")[0];
    seriesPathCache.set(clean, path);
    return path;
  }
  return `/komik/${clean}`;
}

/**
 * Ambil `<path-seri><suffix>` dan ikuti redirect kanonis situs. Slug panjang
 * dipotong situs di alamat kanonis (mis. `/komik/8989-class-de-2-banme-...-to`),
 * sehingga `/komik/<id>-<slug-penuh>` hanya membalas redirect. Alamat hasil
 * koreksi disimpan agar pemanggilan berikutnya langsung benar.
 */
async function fetchSeries(
  clean: string,
  suffix: string,
  revalidate: number,
): Promise<{ r: Fetched; path: string }> {
  let path = await seriesPath(clean);
  let r = await fetchData(`${path}${suffix}`, { revalidate });
  if (r.redirect && r.redirect.startsWith("/komik/")) {
    path = r.redirect.replace(/\/__data\.json.*$/, "").replace(/\/+$/, "").split("?")[0];
    seriesPathCache.set(clean, path);
    r = await fetchData(`${path}${suffix}`, { revalidate });
  }
  return { r, path };
}

function toCard(it: Row, extra: { altMatch?: boolean } = {}): MangaCard | null {
  const slug = str(it?.slug);
  const title = str(it?.title);
  if (!slug || !title) return null;
  rememberSeries(it.id, slug);
  const cover = str(it.cover);
  const thumbs: string[] = [];
  for (const v of [proxiedImage(cover), cover]) if (v && !thumbs.includes(v)) thumbs.push(v);
  const type = normalizeType(it.type);
  const genre = Array.isArray(it.genres) ? str(it.genres[0]) : "";
  const latest: Row | undefined = Array.isArray(it.latest) ? it.latest[0] : undefined;
  const tok = latest ? chapterToken(latest.numberRaw, latest.param) : "";
  const ts = latest ? Date.parse(str(latest.postedAt)) : NaN;
  const altRaw = extra.altMatch ? str(it.altMatch) : "";
  return {
    slug,
    title,
    thumbnail: thumbs[0] ?? "",
    ...(thumbs.length > 1 ? { thumbnailCandidates: thumbs } : {}),
    ...(altRaw ? { altTitle: altRaw } : {}),
    ...(type ? { type } : {}),
    ...(genre ? { genre } : {}),
    ...(Number.isFinite(ts) ? { updatedAt: agoLabel(ts), updatedAtTs: ts } : {}),
    ...(tok ? { latestChapter: { label: tokenLabel(tok), url: chapterUrl(slug, tok) } } : {}),
  };
}

function toCards(items: unknown, extra: { altMatch?: boolean } = {}): MangaCard[] {
  const out: MangaCard[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(items) ? items : []) {
    const c = toCard(it as Row, extra);
    if (!c || seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push(c);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Daftar komik (/komik)                                                */
/* ------------------------------------------------------------------ */

export interface MangaListParams {
  page?: number;
  orderby?: "modified" | "date" | "popular" | "rand";
  tipe?: "manga" | "manhwa" | "manhua";
  genre?: string;
  genre2?: string;
  status?: "ongoing" | "end";
  /** Lewati cache HTTP (probe live). */
  fresh?: boolean;
}

const SORT: Record<NonNullable<MangaListParams["orderby"]>, string> = {
  modified: "terbaru",
  date: "terbaru",
  popular: "populer",
  // Situs tidak punya urutan acak; populer paling mendekati "rekomendasi".
  rand: "populer",
};

async function loadList(
  page: number,
  qs: URLSearchParams,
  fresh = false,
): Promise<{ result: PagedResult<MangaCard>; genres: string[] }> {
  const base = page > 1 ? `/komik/page/${page}/__data.json` : "/komik/__data.json";
  const q = qs.toString();
  const r = await fetchData(q ? `${base}?${q}` : base, { revalidate: 30, fresh });
  const res: Row | undefined = r.node?.result;
  const pages = Number(res?.pages ?? 1);
  return {
    result: {
      items: toCards(res?.items),
      hasNextPage: Number.isFinite(pages) && page < pages,
      ...(typeof res?.total === "number" ? { total: res.total } : {}),
    },
    genres: Array.isArray(r.node?.params?.genres) ? (r.node!.params.genres as string[]) : [],
  };
}

export async function fetchMangaList(params: MangaListParams = {}): Promise<PagedResult<MangaCard>> {
  const page = Math.max(1, params.page ?? 1);
  const qs = new URLSearchParams();
  qs.set("urut", SORT[params.orderby ?? "modified"]);
  if (params.tipe) qs.set("tipe", params.tipe);
  if (params.genre) qs.append("genre", params.genre);
  if (params.genre2) qs.append("genre", params.genre2);
  if (params.status) qs.set("status", params.status === "end" ? "tamat" : "ongoing");
  const { result, genres } = await loadList(page, qs, params.fresh === true);
  // Genre tak dikenal situs diabaikan (daftar penuh dikembalikan) â†’ anggap kosong.
  if (params.genre && genres.length === 0) return { items: [], hasNextPage: false };
  return result;
}

export async function fetchMangaByGenre(genre: string, page = 1): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const qs = new URLSearchParams();
  qs.set("genre", genre);
  const { result, genres } = await loadList(p, qs);
  if (!genres.includes(genre.toLowerCase())) return { items: [], hasNextPage: false };
  return result;
}

/* ------------------------------------------------------------------ */
/* Pencarian (/cari?q=)                                                 */
/* ------------------------------------------------------------------ */

export async function searchMangaRemote(keyword: string, page = 1): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const qs = new URLSearchParams({ q: keyword });
  if (p > 1) qs.set("page", String(p));
  const r = await fetchData(`/cari/__data.json?${qs.toString()}`, { revalidate: 60 });
  const res: Row | undefined = r.node?.results;
  const pages = Number(res?.pages ?? 1);
  return {
    items: toCards(res?.items, { altMatch: true }),
    hasNextPage: Number.isFinite(pages) && p < pages,
    ...(typeof res?.total === "number" ? { total: res.total } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Beranda + peringkat                                                  */
/* ------------------------------------------------------------------ */

export type RankPeriod = "harian" | "mingguan" | "bulanan" | "total";

export interface HomeData {
  latest: MangaCard[];
  ranking: MangaCard[];
}

const RANK_LIST: Record<RankPeriod, string> = {
  harian: "minggu",
  mingguan: "minggu",
  bulanan: "bulan",
  total: "semua",
};

async function homeBlocks(): Promise<Row[]> {
  const r = await fetchData("/__data.json", { revalidate: 60 });
  return Array.isArray(r.node?.blocks) ? (r.node!.blocks as Row[]) : [];
}

function withRank(cards: MangaCard[]): MangaCard[] {
  return cards.map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Jumlah baca per judul (series.views di halaman detail), di-cache 10 menit. */
const viewsCache = new Map<string, { at: number; v?: number }>();
export async function seriesViews(slug: string): Promise<number | undefined> {
  const hit = viewsCache.get(slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  try {
    const { r } = await fetchSeries(slug, "/__data.json", 300);
    const n = Number(r.node?.series?.views);
    const v = Number.isFinite(n) ? n : undefined;
    viewsCache.set(slug, { at: Date.now(), v });
    return v;
  } catch {
    return undefined;
  }
}

export async function fetchRanking(period: RankPeriod = "harian"): Promise<MangaCard[]> {
  const blocks = await homeBlocks();
  const pop = blocks.find((b) => b.kind === "popular");
  let cards = toCards(pop?.lists?.[RANK_LIST[period]]);
  // Daftar beranda hanya 6 judul: lengkapi dari urutan "populer" situs.
  if (cards.length < 12) {
    try {
      const r = await fetchData("/komik/__data.json?urut=populer", { revalidate: 120 });
      const seen = new Set(cards.map((c) => c.slug));
      for (const c of toCards(r.node?.result?.items)) {
        if (!seen.has(c.slug)) {
          seen.add(c.slug);
          cards.push(c);
        }
      }
    } catch {
      // pakai daftar beranda saja
    }
  }
  cards = cards.slice(0, 12);
  await Promise.all(
    cards.map(async (c) => {
      const v = await seriesViews(c.slug);
      if (v !== undefined) c.views = String(v);
    }),
  );
  return withRank(cards);
}

export async function fetchHome(): Promise<HomeData> {
  const blocks = await homeBlocks();
  const series = blocks.filter((b) => b.kind === "series");
  const latestBlock = series.find((b) => /update/i.test(str(b.title))) ?? series[0];
  const pop = blocks.find((b) => b.kind === "popular");
  return {
    latest: toCards(latestBlock?.items),
    ranking: withRank(toCards(pop?.lists?.minggu)),
  };
}

/* ------------------------------------------------------------------ */
/* Genre                                                                */
/* ------------------------------------------------------------------ */

export async function fetchGenres(): Promise<GenreRef[]> {
  const r = await fetchData("/genre/__data.json", { revalidate: 300 });
  const out: GenreRef[] = [];
  for (const g of Array.isArray(r.node?.genres) ? (r.node!.genres as Row[]) : []) {
    const name = str(g.name);
    const slug = str(g.slug);
    if (!name || !slug) continue;
    out.push({ name, slug, ...(typeof g.count === "number" ? { count: g.count } : {}) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Detail                                                               */
/* ------------------------------------------------------------------ */

export async function fetchMangaDetail(slug: string): Promise<MangaDetail> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const { r, path } = await fetchSeries(clean, "/__data.json", 120);
  const n = r.node;
  const s: Row | undefined = n?.series;
  const title = str(s?.title);
  if (!n || !s || !title) {
    throw new KomikuError("Halaman komik tidak memuat data yang dikenali.", MI_BASE + path, 404);
  }
  const sSlug = str(s.slug) || clean.replace(/^\d+-/, "");
  rememberSeries(s.id, sSlug);

  // Detail hanya membawa 20 chapter terbaru (dengan tanggal). Daftar lengkap
  // (id + nomor, tanpa tanggal) ada di halaman reader chapter terbaru.
  const head: Row[] = Array.isArray(n.chapterHead) ? n.chapterHead : [];
  const total = Number(n.chapterTotal) || head.length;
  let all: Row[] = head;
  if (total > head.length && head.length > 0) {
    try {
      const tok = chapterToken(head[0].numberRaw);
      if (tok) {
        const rr = await fetchData(`${path}/chapter-${tok}/__data.json`, { revalidate: 120 });
        const list: Row[] = Array.isArray(rr.node?.chapters) ? rr.node!.chapters : [];
        if (list.length >= head.length) {
          const dates = new Map(head.map((h) => [String(h.id), h.postedAt]));
          all = list.map((c) => ({ ...c, postedAt: c.postedAt ?? dates.get(String(c.id)) }));
        }
      }
    } catch {
      // daftar lengkap gagal â†’ pakai 20 chapter terbaru saja
    }
  }
  const chapters: ChapterItem[] = [];
  const seen = new Set<string>();
  for (const c of all) {
    const tok = chapterToken(c.numberRaw, c.param);
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    const date = chapterDateFromIso(c.postedAt);
    chapters.push({
      title: tokenLabel(tok),
      url: chapterUrl(sSlug, tok),
      ...(date ?? {}),
    });
  }

  const genres: GenreRef[] = [];
  for (const g of Array.isArray(s.genres) ? (s.genres as Row[]) : []) {
    const name = str(g.name);
    const gs = str(g.slug);
    if (name && gs) genres.push({ name, slug: gs });
  }

  // Judul alternatif: nama Latin pertama yang berbeda dari judul utama.
  const altList: string[] = Array.isArray(n.altTitles)
    ? (n.altTitles as unknown[]).map(str)
    : str(s.altTitles).split(/,\s*/);
  const altTitle = altList.find((a) => a && /^[\x20-\x7E]+$/.test(a) && a.toLowerCase() !== title.toLowerCase());

  const rawCover = str(s.cover);
  const cover = proxiedImage(rawCover);
  const coverCandidates = [cover, rawCover].filter((v, i, a) => v && a.indexOf(v) === i);
  const synopsis = cleanSynopsis(str(s.description)) ?? "";
  const type = normalizeType(s.type);
  const status = str(s.status);
  const author = str(s.author);
  const score = typeof s.score === "number" && s.score > 0 ? String(s.score) : "";
  const viewsN = Number(s.views);

  const firstTok = n.firstChapter ? chapterToken(n.firstChapter.numberRaw, n.firstChapter.param) : "";
  const firstChapter: ChapterRef | undefined = firstTok
    ? { label: tokenLabel(firstTok), url: chapterUrl(sSlug, firstTok) }
    : chapters[chapters.length - 1]
      ? { label: chapters[chapters.length - 1].title, url: chapters[chapters.length - 1].url }
      : undefined;
  const latestChapter: ChapterRef | undefined = chapters[0]
    ? { label: chapters[0].title, url: chapters[0].url }
    : undefined;

  return {
    slug: sSlug,
    title,
    ...(altTitle ? { altTitle } : {}),
    cover,
    ...(coverCandidates.length > 1 ? { coverCandidates } : {}),
    synopsis,
    ...(type ? { type } : {}),
    genres,
    ...(author ? { author } : {}),
    ...(status ? { status } : {}),
    ...(Number.isFinite(viewsN) && viewsN >= 0 && s.views != null ? { views: viewsN } : {}),
    ...(score ? { rating: score } : {}),
    ...(firstChapter ? { firstChapter } : {}),
    ...(latestChapter ? { latestChapter } : {}),
    chapters,
  };
}

/* ------------------------------------------------------------------ */
/* Reader                                                               */
/* ------------------------------------------------------------------ */

export async function fetchChapter(
  chapterPath: string,
  _opts: { nav?: boolean } = {},
): Promise<ChapterData> {
  void _opts;
  const clean = "/" + chapterPath.replace(/^\/+|\/+$/g, "") + "/";
  const parsed = parseChapterPath(clean);
  if (!parsed) throw new KomikuError("Format URL chapter tidak valid.", MI_BASE + clean);
  const path = await seriesPath(parsed.mangaSlug);
  let r = await fetchData(`${path}/chapter-${encodeURIComponent(parsed.chapter)}/__data.json`, {
    revalidate: 300,
  });
  if (r.redirect && r.redirect.startsWith("/komik/")) {
    r = await fetchData(`${r.redirect.replace(/\/+$/, "")}/__data.json`, { revalidate: 300 });
  }
  const n = r.node;
  const images: string[] = [];
  for (const im of Array.isArray(n?.images) ? (n!.images as Row[]) : []) {
    const u = str(im?.url);
    if (!u) continue;
    // proxiedImage hanya memproksikan host yang diizinkan; gmbr.pro tetap mentah.
    const v = proxiedImage(u);
    if (!images.includes(v)) images.push(v);
  }
  if (!n || images.length === 0) {
    throw new KomikuError("Halaman chapter tidak memuat gambar yang dikenali.", MI_BASE + clean, 404);
  }
  const mangaSlug = str(n.series?.slug) || parsed.mangaSlug;
  const curTok = chapterToken(n.chapter?.numberRaw, n.chapter?.param) || parsed.chapter;
  const chapterLabel = tokenLabel(curTok);
  const seriesTitle = str(n.series?.title);
  const nb = (x: Row | null | undefined): string | undefined => {
    const tok = x ? chapterToken(x.numberRaw, x.param) : "";
    return tok ? chapterUrl(mangaSlug, tok) : undefined;
  };
  const prevUrl = nb(n.prev);
  const nextUrl = nb(n.next);
  return {
    title: seriesTitle ? `${seriesTitle} ${chapterLabel}` : chapterLabel,
    mangaSlug,
    chapterLabel,
    images,
    ...(prevUrl ? { prevUrl } : {}),
    ...(nextUrl ? { nextUrl } : {}),
    mangaUrl: `/manga/${mangaSlug}/`,
  };
}
