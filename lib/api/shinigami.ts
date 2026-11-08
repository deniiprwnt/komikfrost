import type {
  ChapterData,
  ChapterItem,
  GenreRef,
  KomikType,
  MangaCard,
  MangaDetail,
  PagedResult,
} from "./types";
import { KomikuError } from "./komiku";
import { proxiedImage } from "./img-proxy";

/**
 * Lapisan HTTP + mapping JSON publik Shinigami (dipakai frontend mereka sendiri).
 *
 * Sumber (ditemukan legitimate dari JS publik 11.shinigami.asia):
 * - https://api.shngm.io/v1/manga/list      daftar + pencarian (?q=)
 * - https://api.shngm.io/v1/manga/top       ranking (?filter=daily|weekly|monthly|all_time)
 * - https://api.shngm.io/v1/manga/detail/<manga_id>
 * - https://api.shngm.io/v1/chapter/<manga_id>/list
 * - https://api.shngm.io/v1/chapter/detail/<chapter_id>
 * - https://api.shngm.io/v1/genre/list      daftar genre
 * - https://api.shngm.io/v1/format/list     daftar format (manga/manhwa/manhua)
 * - https://api.shngm.io/v1/type/list       daftar tipe (project/mirror)
 *
 * Envelope: { retcode: 0, message, meta: {page,page_size,total_page,total_record}, data }
 * Status manga: 1 = Ongoing, 2 = Completed, else Hiatus (lihat JS publik).
 * Gambar chapter: base_url + path + filename[] (assets.shngm.id, publik tanpa auth).
 *
 * Semua fetch server-side (dari route /api/*), tanpa cookie/auth/challenge.
 * Error dibungkus KomikuError agar route /api/* menanganinya seragam.
 */

const SHINI_API = "https://api.shngm.io/v1";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/* Envelope + fetch                                                    */
/* ------------------------------------------------------------------ */

interface ShiniMeta {
  page?: number;
  page_size?: number;
  total_page?: number;
  total_record?: number;
}

interface ShiniEnvelope<T> {
  retcode?: number;
  success?: boolean;
  message?: string;
  error?: string;
  meta?: ShiniMeta;
  data?: T;
}

interface ShiniTaxon {
  taxonomy_id: number;
  slug: string;
  name: string;
  type?: string;
}

export interface ShiniManga {
  manga_id: string;
  title: string;
  description?: string;
  alternative_title?: string;
  release_year?: string;
  status?: number;
  cover_image_url?: string;
  cover_portrait_url?: string;
  view_count?: number;
  user_rate?: number;
  country_id?: string;
  bookmark_count?: number;
  latest_chapter_id?: string | null;
  latest_chapter_number?: number | null;
  latest_chapter_time?: string | null;
  taxonomy?: Record<string, ShiniTaxon[]>;
  created_at?: string;
  updated_at?: string;
}

interface ShiniChapterRow {
  chapter_id: string;
  manga_id: string;
  chapter_number: number;
  chapter_title?: string;
  thumbnail_image_url?: string;
  view_count?: number;
  release_date?: string;
}

interface ShiniChapterDetail {
  chapter_id: string;
  manga_id: string;
  chapter_number: number;
  chapter_title?: string;
  base_url?: string;
  base_url_low?: string;
  chapter?: { path?: string; data?: string[] };
  prev_chapter_id?: string | null;
  prev_chapter_number?: number | null;
  next_chapter_id?: string | null;
  next_chapter_number?: number | null;
  release_date?: string;
}

async function fetchShini<T>(
  path: string,
  revalidate = 30,
  fresh = false,
): Promise<{ data: T; meta?: ShiniMeta }> {
  const url = `${SHINI_API}${path}`;
  const ctrl = new AbortController();
  // Gagal cepat (8 dtk, dulu 12): merge menunggu source terlambat.
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    };
    // `fresh` = probe live: lewati cache HTTP Next, langsung ke upstream.
    // Non-fresh memakai cache (30 dtk list, 1 jam chapter detail) agar
    // sumber utama tidak jadi yang paling lambat.
    if (fresh) init.cache = "no-store";
    else init.next = { revalidate };
    res = await fetch(url, init);
  } catch (e) {
    throw new KomikuError(
      e instanceof DOMException && e.name === "AbortError"
        ? "Shinigami terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke Shinigami. Periksa koneksi internet lalu coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // Pesan asli upstream (mis. "manga not found") diteruskan bila JSON.
    let msg = `Shinigami merespons dengan status ${res.status} untuk halaman ini.`;
    try {
      const j = (await res.json()) as ShiniEnvelope<unknown>;
      if (typeof j.message === "string" && j.message) msg = j.message;
    } catch {
      // abaikan — pakai pesan default
    }
    throw new KomikuError(msg, url, res.status);
  }
  let json: ShiniEnvelope<T>;
  try {
    json = (await res.json()) as ShiniEnvelope<T>;
  } catch {
    throw new KomikuError("Respons Shinigami tidak dikenali. Coba lagi.", url, res.status);
  }
  if (json.retcode !== 0 || json.data === undefined || json.data === null) {
    throw new KomikuError(json.message || "Shinigami tidak mengembalikan data.", url, 502);
  }
  return { data: json.data as T, meta: json.meta };
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function normalizeType(raw: string): KomikType | undefined {
  const v = raw.trim().toLowerCase();
  if (v.includes("manhwa")) return "Manhwa";
  if (v.includes("manhua")) return "Manhua";
  if (v.includes("manga")) return "Manga";
  return undefined;
}

/** Tipe komik: taxonomy Format utama, fallback kode negara. */
function mapType(m: ShiniManga): KomikType | undefined {
  const formats = m.taxonomy?.Format ?? [];
  for (const f of formats) {
    const t = normalizeType(f.name);
    if (t) return t;
  }
  const c = (m.country_id || "").toUpperCase();
  if (c === "KR") return "Manhwa";
  if (c === "CN") return "Manhua";
  if (c === "JP") return "Manga";
  return undefined;
}

function mapStatus(status?: number): string | undefined {
  if (status === 1) return "Ongoing";
  if (status === 2) return "Completed";
  if (status === undefined || status === null) return undefined;
  return "Hiatus";
}

/** "2026-09-30T08:42:14Z" → "3 jam lalu" (format dimengerti sortByFresh). */
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

/** "2026-09-27T01:30:50Z" → "27/09/2026" (format tanggal ala Komiku). */
export function fmtDateId(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}

/** 915 → "915", 11.2 → "11-2" (token URL ala /baca/<slug>/<token>). */
export function numToken(n: number): string {
  return String(n).replace(".", "-");
}

/** "11-2" → 11.2, "915" → 915. */
export function parseNumToken(tok: string): number {
  const t = tok.replace(/-(\d+)$/, ".$1");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

function genreNames(m: ShiniManga): GenreRef[] {
  const out: GenreRef[] = [];
  for (const g of m.taxonomy?.Genre ?? []) {
    if (g.slug && g.name) out.push({ name: g.name, slug: g.slug });
  }
  return out;
}

function authorNames(m: ShiniManga): string | undefined {
  const names: string[] = [];
  for (const key of ["Author", "Artist"]) {
    for (const a of m.taxonomy?.[key] ?? []) {
      if (a.name && !names.includes(a.name)) names.push(a.name);
    }
  }
  return names.length > 0 ? names.join(", ") : undefined;
}

/** Cover portrait untuk kartu/detail (rasio slot 3:4); fallback landscape.
 *  Host Shinigami rusak dari jaringan ID → lewat proxy /api/img. */
function coverUrl(m: ShiniManga): string {
  return proxiedImage(m.cover_portrait_url || m.cover_image_url || "");
}

/** Kartu daftar dari satu item manga/list. Slug = manga_id (UUID). */
function toCard(m: ShiniManga): MangaCard {
  const n = m.latest_chapter_number;
  // Waktu absolut untuk label relatif yang menua sendiri di klien.
  const ts = m.latest_chapter_time ? Date.parse(m.latest_chapter_time) : NaN;
  return {
    slug: m.manga_id,
    title: m.title,
    thumbnail: coverUrl(m),
    ...(m.alternative_title ? { altTitle: m.alternative_title } : {}),
    ...(mapType(m) ? { type: mapType(m) as KomikType } : {}),
    ...(m.taxonomy?.Genre?.[0]?.name ? { genre: m.taxonomy.Genre[0].name } : {}),
    ...(timeAgoId(m.latest_chapter_time) ? { updatedAt: timeAgoId(m.latest_chapter_time) as string } : {}),
    ...(Number.isFinite(ts) ? { updatedAtTs: ts } : {}),
    ...(m.description ? { synopsis: m.description } : {}),
    ...(typeof n === "number"
      ? {
          // manga/list tidak memberi nomor chapter pertama — tebak Chapter 1
          // (benar di hampir semua judul). Detail merge memakai daftar
          // chapter asli bila tersedia (lihat mergeCards).
          firstChapter: {
            label: "Chapter 1",
            url: `/${m.manga_id}-chapter-1/`,
          },
          latestChapter: {
            label: `Chapter ${n}`,
            url: `/${m.manga_id}-chapter-${numToken(n)}/`,
          },
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Daftar / ranking / rekomendasi / pencarian                          */
/* ------------------------------------------------------------------ */

export type ShiniFormat = "manga" | "manhwa" | "manhua";

export async function fetchShiniLatest(
  page = 1,
  opts: { format?: ShiniFormat; genre?: string; pageSize?: number; fresh?: boolean } = {},
): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const q = new URLSearchParams({
    page: String(p),
    page_size: String(opts.pageSize ?? 24),
    is_update: "true",
    sort: "latest",
    sort_order: "desc",
  });
  if (opts.format) q.set("format", opts.format);
  if (opts.genre) q.set("genre_include", opts.genre);
  // Revalidate 10 dtk (bukan default 30) — auto-refresh klien 5 dtk, cache
  // lebih lama dari itu membuat komik baru selalu ketinggalan. `fresh`
  // (probe live) bypass cache ini sepenuhnya.
  const { data, meta } = await fetchShini<ShiniManga[]>(
    `/manga/list?${q}`,
    10,
    opts.fresh === true,
  );
  const items = Array.isArray(data) ? data.map(toCard) : [];
  const total = meta?.total_page ?? p;
  return { items, hasNextPage: p < total };
}

export type ShiniTopFilter = "daily" | "weekly" | "monthly" | "all_time";

export async function fetchShiniTop(
  filter: ShiniTopFilter = "daily",
  page = 1,
  pageSize = 10,
): Promise<MangaCard[]> {
  const q = new URLSearchParams({
    filter,
    page: String(Math.max(1, page)),
    page_size: String(pageSize),
  });
  const { data } = await fetchShini<ShiniManga[]>(`/manga/top?${q}`);
  return Array.isArray(data) ? data.map(toCard) : [];
}

export async function fetchShiniRecommended(pageSize = 24): Promise<MangaCard[]> {
  const q = new URLSearchParams({
    page: "1",
    page_size: String(pageSize),
    is_recommended: "true",
    sort: "latest",
    sort_order: "desc",
  });
  const { data } = await fetchShini<ShiniManga[]>(`/manga/list?${q}`);
  return Array.isArray(data) ? data.map(toCard) : [];
}

/** Cari komik — q = kata kunci (frontend Shinigami menembak tiap ≥3 char). */
export async function searchShiniRemote(
  keyword: string,
  page = 1,
  pageSize = 24,
): Promise<PagedResult<MangaCard>> {
  const kw = keyword.trim();
  if (kw.length < 2) return { items: [], hasNextPage: false };
  const p = Math.max(1, page);
  const q = new URLSearchParams({ page: String(p), page_size: String(pageSize), q: kw });
  const { data, meta } = await fetchShini<ShiniManga[]>(`/manga/list?${q}`);
  const items = Array.isArray(data) ? data.map(toCard) : [];
  const total = meta?.total_page ?? p;
  return { items, hasNextPage: p < total };
}

/* ------------------------------------------------------------------ */
/* Genre / format                                                      */
/* ------------------------------------------------------------------ */

export async function fetchShiniGenres(): Promise<GenreRef[]> {
  const { data } = await fetchShini<ShiniTaxon[]>(`/genre/list`);
  if (!Array.isArray(data)) return [];
  return data
    .filter((g) => g.slug && g.name)
    .map((g) => ({ name: g.name, slug: g.slug }));
}

export async function fetchShiniFormats(): Promise<GenreRef[]> {
  const { data } = await fetchShini<ShiniTaxon[]>(`/format/list?page=1`);
  if (!Array.isArray(data)) return [];
  return data
    .filter((g) => g.slug && g.name)
    .map((g) => ({ name: g.name, slug: g.slug }));
}

/** UUID manga Shinigami (slug detail / kartu murni Shinigami). */
export function isShiniId(slug: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    slug.replace(/^\/+|\/+$/g, ""),
  );
}

function normTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[-------_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve slug Komiku (mis. "solo-leveling") → detail Shinigami.
 * Cari via ?q= lalu cocokkan normalizeTitle EXACT (konservatif, tanpa fuzzy).
 * AltTitle (EN) opsional ikut dicoba — judul utama upstream kadang beda
 * ejaan satu-dua huruf ("...Desu" vs "...Des") tapi judul EN-nya identik.
 * Tidak cocok → throw (aggregator menganggap source ini gagal → Komiku saja).
 * UUID langsung → fetchShiniDetail.
 */
export async function resolveShiniDetailForSlug(slug: string, altTitle?: string): Promise<MangaDetail> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (isShiniId(clean)) return fetchShiniDetail(clean);
  const base = clean.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!base) {
    throw new KomikuError("Slug kosong.", `${SHINI_API}/manga/list`);
  }
  // Slug Komiku kadang berekor penanda duplikat ("solo-leveling-id",
  // "one-piece-id2") yang BUKAN bagian judul. Coba tiap kandidat sebagai
  // target exact-match (konservatif — tanpa fuzzy), dari paling bersih dulu.
  const cands: string[] = [];
  for (const v of [
    base.replace(/\s+id\s*\d*$/i, "").trim(),
    base,
  ]) {
    if (v && !cands.includes(v)) cands.push(v);
  }
  for (const target of cands) {
    const words = target.split(" ");
    const queries = [target];
    if (words.length > 3) queries.push(words.slice(0, 3).join(" "));
    const normTarget = normTitle(target);
    // Kandidat target: judul + altTitle pemanggil (exact, tanpa fuzzy).
    const normAlts: string[] = [];
    if (altTitle) {
      const na = normTitle(altTitle);
      if (na && na !== normTarget) normAlts.push(na);
    }
    for (const query of queries) {
      const params = new URLSearchParams({ page: "1", page_size: "10", q: query });
      const { data } = await fetchShini<ShiniManga[]>(`/manga/list?${params}`);
      if (!Array.isArray(data)) continue;
      // Judul utama ATAU judul alternatif (EN) yang cocok exact → hit.
      // Upstream kadang memotong judul utama ("...Desu" → "...Des") tapi
      // menyimpan judul EN lengkap di alternative_title.
      const hit = data.find(
        (m) =>
          normTitle(m.title) === normTarget ||
          (m.alternative_title && normTitle(m.alternative_title) === normTarget) ||
          (m.alternative_title && normAlts.includes(normTitle(m.alternative_title))),
      );
      if (hit) return fetchShiniDetail(hit.manga_id);
    }
  }
  throw new KomikuError(
    `Tidak ditemukan di Shinigami: ${clean}.`,
    `${SHINI_API}/manga/list`,
    404,
  );
}

/* ------------------------------------------------------------------ */
/* Detail + chapter list                                               */
/* ------------------------------------------------------------------ */

function toChapterItem(mangaId: string, r: ShiniChapterRow): ChapterItem {
  return {
    title: `Chapter ${r.chapter_number}`,
    url: `/${mangaId}-chapter-${numToken(r.chapter_number)}/`,
    ...(fmtDateId(r.release_date) ? { date: fmtDateId(r.release_date) as string } : {}),
    // chapter_id diteruskan agar reader merge bisa langsung chapter/detail
    // tanpa me-list ulang (lihat fetchShiniChapterById).
    ...(r.chapter_id ? { chapterId: r.chapter_id } : {}),
  };
}

/** Seluruh chapter satu manga (terbaru dulu), loop halaman bila >1000. */
export async function fetchShiniChaptersAll(mangaId: string): Promise<ShiniChapterRow[]> {
  const out: ShiniChapterRow[] = [];
  let page = 1;
  for (;;) {
    const q = new URLSearchParams({
      page: String(page),
      page_size: "1000",
      sort_by: "chapter_number",
      sort_order: "desc",
    });
    const { data, meta } = await fetchShini<ShiniChapterRow[]>(`/chapter/${mangaId}/list?${q}`);
    if (Array.isArray(data)) out.push(...data);
    const total = meta?.total_page ?? 1;
    if (page >= total || page >= 5) break;
    page += 1;
  }
  return out;
}

/** Detail manga + daftar chapter lengkap (tanpa sumber lain — merge di agregator). */
export async function fetchShiniDetail(mangaId: string): Promise<MangaDetail> {
  const id = mangaId.replace(/^\/+|\/+$/g, "");
  const { data: m } = await fetchShini<ShiniManga>(`/manga/detail/${encodeURIComponent(id)}`);
  const rows = await fetchShiniChaptersAll(id);
  const chapters: ChapterItem[] = rows.map((r) => toChapterItem(id, r));
  const first = chapters.length > 0 ? chapters[chapters.length - 1] : undefined;
  const latest = chapters.length > 0 ? chapters[0] : undefined;
  const type = mapType(m);
  const status = mapStatus(m.status);
  const author = authorNames(m);
  return {
    slug: id,
    title: m.title,
    ...(m.alternative_title ? { altTitle: m.alternative_title } : {}),
    cover: coverUrl(m),
    synopsis: m.description ?? "",
    ...(type ? { type } : {}),
    genres: genreNames(m),
    ...(author ? { author } : {}),
    ...(status ? { status } : {}),
    ...(typeof m.user_rate === "number" ? { rating: String(m.user_rate) } : {}),
    ...(first ? { firstChapter: { label: first.title, url: first.url } } : {}),
    ...(latest ? { latestChapter: { label: latest.title, url: latest.url } } : {}),
    chapters,
  };
}

/* ------------------------------------------------------------------ */
/* Reader chapter                                                      */
/* ------------------------------------------------------------------ */

/** Nama file "9999-*.jpg" = kartu akhir/promo (di luar urutan 00..NN) — buang. */
function isPageFile(name: string): boolean {
  if (/^9999-/i.test(name)) return false;
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

/**
 * Judul manga saja (tanpa daftar chapter). Dipakai reader untuk slug UUID murni
 * yang tidak membawa judul; gagal = string kosong, reader tidak boleh ikut gagal.
 */
async function fetchShiniTitle(mangaId: string): Promise<string> {
  try {
    const id = mangaId.replace(/^\/+|\/+$/g, "");
    const { data: m } = await fetchShini<ShiniManga>(`/manga/detail/${encodeURIComponent(id)}`, 3600);
    return typeof m.title === "string" ? m.title.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Ambil satu chapter Shinigami berdasarkan NOMOR chapter.
 * Untuk flow merge (chapter_id SUDAH diketahui dari daftar gabungan),
 * pakai fetchShiniChapterById agar TIDAK me-list ulang.
 * @param mangaId     UUID manga Shinigami
 * @param num         nomor chapter (mis. 915 / 11.2)
 * @param displaySlug slug rute /baca/<slug>/... (slug Komiku bila gabungan, UUID bila murni)
 * @param mangaTitle  judul untuk title reader
 */
export async function fetchShiniChapter(
  mangaId: string,
  num: number,
  displaySlug: string,
  mangaTitle: string,
): Promise<ChapterData> {
  // Judul kosong (slug UUID murni) → ambil sendiri, paralel dengan daftar chapter,
  // agar title reader/riwayat berisi nama komik, bukan hanya "Chapter N".
  const [rows, resolvedTitle] = await Promise.all([
    fetchShiniChaptersAll(mangaId),
    mangaTitle ? Promise.resolve(mangaTitle) : fetchShiniTitle(mangaId),
  ]);
  const row = rows.find((r) => r.chapter_number === num);
  if (!row) {
    throw new KomikuError(
      `Chapter ${num} belum tersedia di Shinigami.`,
      `${SHINI_API}/chapter/${mangaId}/list`,
      404,
    );
  }
  return fetchShiniChapterById(row.chapter_id, displaySlug, resolvedTitle);
}

/**
 * Ambil satu chapter Shinigami langsung via chapter_id — TANPA chapter-list.
 * Dipakai jalur merge (getChapterMerged) yang chapter_id-nya sudah dibawa
 * daftar chapter gabungan.
 */
export async function fetchShiniChapterById(
  chapterId: string,
  displaySlug: string,
  mangaTitle: string,
): Promise<ChapterData> {
  const { data: d } = await fetchShini<ShiniChapterDetail>(
    `/chapter/detail/${chapterId}`,
    3600,
  );
  const base = (d.base_url || "https://assets.shngm.id").replace(/\/+$/, "");
  const path = d.chapter?.path ?? "";
  const files = Array.isArray(d.chapter?.data) ? d.chapter.data : [];
  // Gambar reader Shinigami satu host dengan cover → proxy juga.
  const images = files.filter(isPageFile).map((f) => proxiedImage(`${base}${path}${f}`));
  if (images.length === 0) {
    throw new KomikuError(
      "Halaman chapter Shinigami tidak memuat gambar yang dikenali.",
      `${SHINI_API}/chapter/detail/${chapterId}`,
    );
  }
  const label =
    d.chapter_title && d.chapter_title.trim()
      ? `Chapter ${d.chapter_number}: ${d.chapter_title.trim()}`
      : `Chapter ${d.chapter_number}`;
  const tok = (n: number | null | undefined): string | null =>
    typeof n === "number" ? numToken(n) : null;
  const prevTok = tok(d.prev_chapter_number);
  const nextTok = tok(d.next_chapter_number);
  const title = mangaTitle ? `${mangaTitle} ${label.split(":")[0]}` : label;
  return {
    title,
    mangaSlug: displaySlug,
    chapterLabel: label,
    images,
    ...(prevTok ? { prevUrl: `/${displaySlug}-chapter-${prevTok}/` } : {}),
    ...(nextTok ? { nextUrl: `/${displaySlug}-chapter-${nextTok}/` } : {}),
    mangaUrl: `/komik/${displaySlug}`,
  };
}
