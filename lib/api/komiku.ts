import * as cheerio from "cheerio";
import { anchorTs, updatedAtMinutes } from "./aggregator";
import type {
  ApiError,
  ChapterData,
  ChapterItem,
  ChapterRef,
  GenreRef,
  KomikType,
  MangaCard,
  MangaDetail,
  PagedResult,
} from "./types";

/**
 * Lapisan HTTP + parsing HTML Komiku.org.
 *
 * Sumber (milik Komiku, dipakai situsnya sendiri):
 * - https://komiku.org/...          halaman server-rendered (detail, reader, ranking, daftar genre)
 * - https://api.komiku.org/manga/   fragment HTML daftar komik (dipakai /pustaka/ via htmx)
 * - https://api.komiku.org/genre/<slug>/  fragment HTML komik per genre
 * - https://api.komiku.org/?post_type=manga&s=<kw>  fragment HTML hasil pencarian
 *
 * Semua fetch dilakukan server-side (dari route /api/*) agar tidak ada
 * masalah CORS di browser. Hanya GET halaman publik, tanpa bypass
 * autentikasi/CAPTCHA/pembatasan apa pun.
 */

const KOMIKU_BASE = "https://komiku.org";
const KOMIKU_API = "https://api.komiku.org";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class KomikuError extends Error {
  source: string;
  status?: number;
  constructor(message: string, source: string, status?: number) {
    super(message);
    this.name = "KomikuError";
    this.source = source;
    this.status = status;
  }
  toJSON(): ApiError {
    return { message: this.message, source: this.source, status: this.status };
  }
}

/**
 * Umur respons di cache CDN/proxy upstream (header `Age`, detik → ms), per URL.
 * Teks relatif Komiku ("9 menit lalu") dibuat saat HTML DIBANGKITKAN, bukan
 * saat kita mengambilnya; kalau HTML itu sudah mengendap di cache, waktu
 * update sebenarnya lebih tua sebesar umur cache tersebut.
 */
const upstreamAgeMs = new Map<string, number>();

function takeUpstreamAge(url: string): number {
  const v = upstreamAgeMs.get(url) ?? 0;
  upstreamAgeMs.delete(url);
  return v;
}

async function fetchHtml(url: string, revalidate = 30, fresh = false): Promise<string> {
  const ctrl = new AbortController();
  // Komiku kadang lambat merespons; gagal cepat (8 dtk) agar UI bisa
  // menampilkan error/retry daripada menggantung tanpa batas.
  // 8 dtk (dulu 12): fetchAllSettled menunggu source TERLAMBAT, jadi satu
  // source lemot menahan seluruh merge — homepage yang scrape 3 source
  // berlapis sangat sensitif terhadap ekor lambat ini.
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: { "User-Agent": UA, Referer: KOMIKU_BASE + "/", Accept: "text/html" },
      signal: ctrl.signal,
    };
    // `fresh` = probe live beranda/terbaru: lewati cache HTTP Next agar
    // polling 5 dtk benar-benar menembak sumber data, bukan snapshot lama.
    if (fresh) init.cache = "no-store";
    // Default 10 dtk agar /terbaru dan beranda segera mengikuti update
    // (auto-refresh klien 5 dtk; cache lebih lama = komik baru terlambat).
    else init.next = { revalidate };
    res = await fetch(url, init);
  } catch (e) {
    throw new KomikuError(
      e instanceof DOMException && e.name === "AbortError"
        ? "Sumber data terlalu lama merespons. Coba lagi."
        : "Tidak dapat terhubung ke sumber data. Periksa koneksi internet lalu coba lagi.",
      url,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new KomikuError(
      `Sumber data merespons dengan status ${res.status} untuk halaman ini.`,
      url,
      res.status,
    );
  }
  const ageSec = parseInt(res.headers.get("age") ?? "", 10);
  upstreamAgeMs.set(url, Number.isFinite(ageSec) && ageSec > 0 ? ageSec * 1000 : 0);
  return res.text();
}

/** Ubah href Komiku (relatif/absolut) menjadi path, mis. "/manga/blue-lock/". */
function toPath(href: string | undefined): string {
  if (!href) return "";
  try {
    return new URL(href, KOMIKU_BASE).pathname;
  } catch {
    return href;
  }
}

/** Ambil slug dari path /manga/<slug>/. */
export function mangaSlugFromPath(path: string): string {
  const m = path.match(/\/manga\/([^/]+)\/?/);
  return m ? decodeURIComponent(m[1]) : "";
}

function normalizeType(raw: string): KomikType | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "manga") return "Manga";
  if (v === "manhwa") return "Manhwa";
  if (v === "manhua") return "Manhua";
  return undefined;
}

function absUrl(src: string | undefined): string {
  if (!src) return "";
  const s = src.trim();
  if (!s || s.startsWith("data:")) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http")) return s;
  return KOMIKU_BASE + (s.startsWith("/") ? s : "/" + s);
}

function pickImg($el: cheerio.Cheerio<any>): string {
  return absUrl($el.attr("data-src") || $el.attr("src"));
}

/* ------------------------------------------------------------------ */
/* Parser kartu .bge (fragment api.komiku.org: manga, genre, search)    */
/* ------------------------------------------------------------------ */

/**
 * API Komiku kadang mengembalikan kartu yang sama dua kali dalam satu
 * response — buang duplikat berdasarkan slug agar key React tetap unik
 * dan daftar tidak menampilkan judul yang sama berulang.
 */
function dedupeCards(cards: MangaCard[]): MangaCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  });
}

function parseBgeCards($: cheerio.CheerioAPI, ageMs = 0): MangaCard[] {
  const cards: MangaCard[] = [];
  $("div.bge").each((_, el) => {
    const root = $(el);
    const link = root.find("div.kan > a[href]").first();
    const href = toPath(link.attr("href"));
    const slug = mangaSlugFromPath(href);
    const title = link.find("h3").text().trim() || link.text().trim();
    if (!slug || !title) return;

    const img = root.find("div.bgei img").first();
    const thumbnail = pickImg(img);

    // Tipe + genre utama: <div class="tpe1_inf"><b>Manhwa</b> Fantasi</div>
    const tpe = root.find("div.tpe1_inf").first();
    const type = normalizeType(tpe.find("b").first().text());
    const genreRaw = tpe.clone().children("b").remove().end().text().trim();
    const genre = genreRaw || undefined;

    // Meta: <span class="judul2"> Fantasi | 2 jam lalu | Berwarna</span> (list)
    // Search tidak punya .judul2 — melainkan <p>Update X lalu.</p>
    const judul2 = root.find("span.judul2").first().text().trim();
    const descP = root.find("div.kan > p").first().text().trim();
    let updatedAt: string | undefined;
    let synopsis: string | undefined;
    if (judul2) {
      // "Fantasi | 4 menit lalu" (varian lain: "… yang lalu", "Baru saja").
      // Tanpa pola "baru saja" kartu terbaru kehilangan waktu update lalu
      // tergeser ke belakang daftar versi ini.
      const m = judul2.match(/(\d+\s+\w+(?:\s+\w+)?\s+lalu|baru saja)/i);
      updatedAt = m ? m[1].replace(/\s+/g, " ") : undefined;
      if (descP && !/^update\s/i.test(descP)) synopsis = descP;
    } else if (descP) {
      const m = descP.match(/update\s+(.+?)\s*\./i);
      updatedAt = m ? m[1] : descP;
    }

    // Komiku hanya memberi teks relatif → titik waktu absolutnya diturunkan
    // saat scrape. Klien memakai ini untuk menghitung ulang label tiap menit
    // (label teks di atas membeku pada waktu scrape).
    const agoMinutes = updatedAtMinutes(updatedAt);

    // Tentukan Awal vs Terbaru dari PREFIKS LABEL, bukan urutan/posisi link.
    // Kartu dengan hanya 1 link (komik baru rilis 1 chapter, atau markup
    // beda dari biasanya) dulu selalu jatuh ke refs[0]/firstChapter meski
    // labelnya "Terbaru: ..." — akibatnya latestChapter kosong dan kartu
    // di listing (/terbaru, beranda) tidak pernah menampilkan chapter
    // terbaru, walau halaman detail komik (yang mengecek prefiks label,
    // lihat fetchMangaDetail di bawah) selalu benar.
    let firstChapter: ChapterRef | undefined;
    let latestChapter: ChapterRef | undefined;
    root.find("div.new1 a[href]").each((_, a) => {
      const $a = $(a);
      const url = toPath($a.attr("href"));
      // Hanya link chapter yang valid; link /manga/<slug>/ (kartu tanpa
      // chapter) dilewati. Label "Awal: Chapter 1" / "Terbaru: Chapter 10".
      if (!url || !/-chapter-/.test(url)) return;
      const text = $a.text().replace(/\s+/g, " ").trim();
      const prefixMatch = text.match(/^(Awal|Terbaru):\s*/i);
      const label = text.replace(/^(Awal|Terbaru):\s*/i, "").trim();
      if (!label) return;
      const prefix = prefixMatch?.[1].toLowerCase();
      if (prefix === "awal") firstChapter = { label, url };
      else if (prefix === "terbaru") latestChapter = { label, url };
      // Fallback tanpa prefiks yang dikenali: pakai posisi seperti semula
      // (link pertama = awal, berikutnya = terbaru) daripada kehilangan data.
      else if (!firstChapter) firstChapter = { label, url };
      else if (!latestChapter) latestChapter = { label, url };
    });

    // Dijangkar per slug+chapter terbaru agar tidak ikut "membeku" di teks
    // sumber yang basi (lihat anchorTs).
    const updatedAtTs = anchorTs(`komiku:${slug}#${(latestChapter as ChapterRef | undefined)?.url ?? ""}`, agoMinutes, ageMs);

    cards.push({
      slug,
      title,
      thumbnail,
      ...(type ? { type } : {}),
      ...(genre ? { genre } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(updatedAtTs !== undefined ? { updatedAtTs } : {}),
      ...(synopsis ? { synopsis } : {}),
      ...(firstChapter ? { firstChapter } : {}),
      ...(latestChapter ? { latestChapter } : {}),
    });
  });
  return dedupeCards(cards);
}

/** Deteksi infinite-scroll berikutnya: <span hx-get=".../manga/page/N/">. */
function detectNextPage($: cheerio.CheerioAPI): boolean {
  let found = false;
  $("span[hx-get]").each((_, el) => {
    const v = $(el).attr("hx-get") || "";
    if (/\/page\/\d+\/?(\?|$)/.test(v)) found = true;
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* Daftar komik (api.komiku.org/manga/)                                */
/* ------------------------------------------------------------------ */

export interface MangaListParams {
  page?: number;
  orderby?: "modified" | "date" | "popular" | "rand";
  tipe?: "manga" | "manhwa" | "manhua";
  genre?: string;
  genre2?: string;
  status?: "ongoing" | "end";
  /** Lewati cache HTTP upstream (probe live /api/latest?live=1). */
  fresh?: boolean;
}

export async function fetchMangaList(
  params: MangaListParams = {},
): Promise<PagedResult<MangaCard>> {
  const page = Math.max(1, params.page ?? 1);
  const url = new URL(
    page > 1 ? `${KOMIKU_API}/manga/page/${page}/` : `${KOMIKU_API}/manga/`,
  );
  if (params.orderby) url.searchParams.set("orderby", params.orderby);
  if (params.tipe) url.searchParams.set("tipe", params.tipe);
  if (params.genre) url.searchParams.set("genre", params.genre);
  if (params.genre2) url.searchParams.set("genre2", params.genre2);
  if (params.status) url.searchParams.set("status", params.status);

  // Daftar memakai cache sangat singkat (10 dtk) agar komik baru cepat
  // tampil; key stabil per page/filter/orderby. Probe live (`fresh`) bypass
  // total supaya polling klien melihat kondisi sumber data saat ini.
  // Probe live: parameter acak membuat CDN upstream memperlakukannya sebagai
  // URL baru, sehingga HTML basi di cache tidak ikut terbawa.
  if (params.fresh === true) url.searchParams.set("_t", String(Date.now()));
  const html = await fetchHtml(url.toString(), 10, params.fresh === true);
  const $ = cheerio.load(html);
  return {
    items: parseBgeCards($, takeUpstreamAge(url.toString())),
    hasNextPage: detectNextPage($),
  };
}

/* ------------------------------------------------------------------ */
/* Komik per genre (api.komiku.org/genre/<slug>/)                      */
/* ------------------------------------------------------------------ */

export async function fetchMangaByGenre(
  genre: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const url =
    p > 1
      ? `${KOMIKU_API}/genre/${encodeURIComponent(genre)}/page/${p}/`
      : `${KOMIKU_API}/genre/${encodeURIComponent(genre)}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  return { items: parseBgeCards($), hasNextPage: detectNextPage($) };
}

/* ------------------------------------------------------------------ */
/* Pencarian (api.komiku.org/?post_type=manga&s=)                       */
/* ------------------------------------------------------------------ */

export async function searchMangaRemote(
  keyword: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const url =
    p > 1
      ? `${KOMIKU_API}/page/${p}/?post_type=manga&s=${encodeURIComponent(keyword)}`
      : `${KOMIKU_API}/?post_type=manga&s=${encodeURIComponent(keyword)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  // Hasil pencarian tidak memakai infinite scroll — halaman penuh (10 kartu)
  // berarti kemungkinan masih ada halaman berikut.
  const items = parseBgeCards($);
  return { items, hasNextPage: items.length >= 10 };
}

/* ------------------------------------------------------------------ */
/* Ranking (komiku.org/p/ranking — panel harian/mingguan/bulanan/total) */
/* ------------------------------------------------------------------ */

export type RankPeriod = "harian" | "mingguan" | "bulanan" | "total";

export async function fetchRanking(period: RankPeriod = "harian"): Promise<MangaCard[]> {
  const html = await fetchHtml(`${KOMIKU_BASE}/p/ranking/`);
  const $ = cheerio.load(html);
  const cards: MangaCard[] = [];
  $(`#rank-${period} article.ls4`).each((_, el) => {
    const root = $(el);
    const link = root.find("div.ls4j h4 a[href]").first();
    const href = toPath(link.attr("href"));
    const slug = mangaSlugFromPath(href);
    const title = link.text().trim();
    if (!slug || !title) return;

    const img = root.find("div.ls4v img").first();
    const thumbnail = pickImg(img);
    const rank = parseInt(root.find("span.rank-num").first().text().trim(), 10);

    // "Fantasi · 37,061 views" → genre + views
    const meta = root.find("span.ls4s").first().text().trim();
    const [genrePart, viewsPart] = meta.split("·").map((s) => s.trim());
    const genre = genrePart || undefined;
    const views = viewsPart || undefined;

    const chA = root.find("a.ls24[href]").first();
    const chUrl = toPath(chA.attr("href"));
    const chLabel = chA.text().trim();

    cards.push({
      slug,
      title,
      thumbnail,
      ...(genre ? { genre } : {}),
      ...(views ? { views } : {}),
      ...(Number.isFinite(rank) ? { rank } : {}),
      ...(chUrl && chLabel ? { latestChapter: { label: chLabel, url: chUrl } } : {}),
    });
  });
  return dedupeCards(cards);
}

/* ------------------------------------------------------------------ */
/* Homepage (komiku.org/): update terbaru + ranking harian + baru       */
/* ------------------------------------------------------------------ */

export interface HomeData {
  latest: MangaCard[];
  ranking: MangaCard[];
}

function parseLs2Cards($: cheerio.CheerioAPI, scope: cheerio.Cheerio<any>): MangaCard[] {
  const cards: MangaCard[] = [];
  scope.find("article.ls2").each((_, el) => {
    const root = $(el);
    const link = root.find("div.ls2j h3 a[href]").first();
    const href = toPath(link.attr("href"));
    const slug = mangaSlugFromPath(href);
    const title = link.text().trim();
    if (!slug || !title) return;

    const img = root.find("div.ls2v img").not(".flag").first();
    const thumbnail = pickImg(img);
    // Tipe dari flag: jp.png=manga, kr.png=manhwa, cn.png=manhua
    const flag = root.find("div.ls2v img.flag").first().attr("src") || "";
    const type: KomikType | undefined = flag.includes("kr")
      ? "Manhwa"
      : flag.includes("cn")
        ? "Manhua"
        : flag.includes("jp")
          ? "Manga"
          : undefined;

    // "Fantasi · 2 jam lalu" → genre + updatedAt
    const meta = root.find("span.ls2t").first().text().trim();
    const [genrePart, timePart] = meta.split("·").map((s) => s.trim());
    // Titik waktu absolut — tanpa ini label kartu homepage membeku
    // (dulu satu-satunya parser yang lupa mengisinya).
    const agoMinutes = updatedAtMinutes(timePart);

    const chA = root.find("a.ls2l[href]").first();
    const chUrl = toPath(chA.attr("href"));
    const chLabel = chA.text().trim();
    const updatedAtTs = anchorTs(`komiku:${slug}#${chUrl ?? ""}`, agoMinutes);

    cards.push({
      slug,
      title,
      thumbnail,
      ...(type ? { type } : {}),
      ...(genrePart ? { genre: genrePart } : {}),
      ...(timePart ? { updatedAt: timePart } : {}),
      ...(updatedAtTs !== undefined ? { updatedAtTs } : {}),
      ...(chUrl && chLabel ? { latestChapter: { label: chLabel, url: chUrl } } : {}),
    });
  });
  return dedupeCards(cards);
}

export async function fetchHome(): Promise<HomeData> {
  const html = await fetchHtml(`${KOMIKU_BASE}/`);
  const $ = cheerio.load(html);
  // Section "Baca Komik Terbaru": heading .lsh3 + container artikel .ls2
  // Ambil semua article.ls2 di homepage sebagai update terbaru.
  const latest = parseLs2Cards($, $.root());
  const ranking: MangaCard[] = [];
  $("#rank-harian article.ls4").each((_, el) => {
    const root = $(el);
    const link = root.find("div.ls4j h4 a[href]").first();
    const href = toPath(link.attr("href"));
    const slug = mangaSlugFromPath(href);
    const title = link.text().trim();
    if (!slug || !title) return;
    const img = root.find("div.ls4v img").first();
    const thumbnail = pickImg(img);
    const rank = parseInt(root.find("span.rank-num").first().text().trim(), 10);
    const meta = root.find("span.ls4s").first().text().trim();
    const [genrePart, viewsPart] = meta.split("·").map((s) => s.trim());
    const chA = root.find("a.ls24[href]").first();
    const chUrl = toPath(chA.attr("href"));
    const chLabel = chA.text().trim();
    ranking.push({
      slug,
      title,
      thumbnail,
      ...(genrePart ? { genre: genrePart } : {}),
      ...(viewsPart ? { views: viewsPart } : {}),
      ...(Number.isFinite(rank) ? { rank } : {}),
      ...(chUrl && chLabel ? { latestChapter: { label: chLabel, url: chUrl } } : {}),
    });
  });
  return { latest: dedupeCards(latest), ranking: dedupeCards(ranking) };
}

/* ------------------------------------------------------------------ */
/* Detail + chapter list (komiku.org/manga/<slug>/)                    */
/* ------------------------------------------------------------------ */

export async function fetchMangaDetail(slug: string): Promise<MangaDetail> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const html = await fetchHtml(`${KOMIKU_BASE}/manga/${encodeURIComponent(clean)}/`);
  const $ = cheerio.load(html);

  const cover = pickImg($("section#Informasi div.ims img").first());
  const title =
    $("section#Informasi table.inftable tr")
      .filter((_, tr) => $(tr).find("td").first().text().trim().toLowerCase().startsWith("judul:"))
      .find("td")
      .last()
      .text()
      .trim() ||
    $("h1").first().text().trim().replace(/^Komik\s+/i, "");
  const synopsis = $("section#Informasi p.desc[itemprop='description']").text().trim();

  const info: Record<string, string> = {};
  $("section#Informasi table.inftable tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 2) {
      const key = $(tds[0]).text().trim().replace(/:$/, "").toLowerCase();
      info[key] = $(tds[1]).text().trim();
    }
  });

  const genres: GenreRef[] = [];
  $("section#Informasi ul.genre li.genre a[href]").each((_, a) => {
    const $a = $(a);
    const href = toPath($a.attr("href"));
    const m = href.match(/\/genre\/([^/]+)\/?/);
    const name = $a.text().trim();
    if (m && name) genres.push({ name, slug: m[1] });
  });

  const altTitle = info["judul alternatif"] || undefined;
  const type = info["tipe"] || undefined;
  const theme = info["tema"] || undefined;
  const author = info["author"] || undefined;
  const status = info["status"] || undefined;
  const rating = info["rating"] || undefined;
  const readingDirection = info["cara baca"] || undefined;

  // Awal & Terbaru
  let firstChapter: ChapterRef | undefined;
  let latestChapter: ChapterRef | undefined;
  $("section#Informasi div.linkbutt div.new1 a[href]").each((_, a) => {
    const $a = $(a);
    const url = toPath($a.attr("href"));
    const label = $a.find("span").last().text().trim() || $a.text().trim();
    const prefix = $a.find("span").first().text().trim().toLowerCase();
    if (!url || !label) return;
    if (prefix.startsWith("awal")) firstChapter = { label, url };
    else if (prefix.startsWith("terbaru")) latestChapter = { label, url };
  });

  const chapters: ChapterItem[] = [];
  $("table#Daftar_Chapter tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const a = $tr.find("td.judulseries a[href]").first();
    if (!a.length) return; // baris header filter
    const url = toPath(a.attr("href"));
    const chTitle = a.find("span[itemprop='name'] b").text().trim() || a.text().trim();
    const date = $tr.find("td.tanggalseries").first().text().trim() || undefined;
    if (url && chTitle) chapters.push({ title: chTitle, url, ...(date ? { date } : {}) });
  });

  if (!title) {
    throw new KomikuError("Halaman komik tidak memuat data yang dikenali.", `${KOMIKU_BASE}/manga/${clean}/`);
  }

  return {
    slug: clean,
    title,
    ...(altTitle ? { altTitle } : {}),
    cover,
    synopsis,
    ...(type ? { type } : {}),
    ...(theme ? { theme } : {}),
    genres,
    ...(author ? { author } : {}),
    ...(status ? { status } : {}),
    ...(rating ? { rating } : {}),
    ...(readingDirection ? { readingDirection } : {}),
    ...(firstChapter ? { firstChapter } : {}),
    ...(latestChapter ? { latestChapter } : {}),
    chapters,
  };
}

/* ------------------------------------------------------------------ */
/* Reader (komiku.org/<slug>-chapter-<n>/)                             */
/* ------------------------------------------------------------------ */

/** Slug komik + label chapter dari path "/<slug>-chapter-<n>/". */
export function parseChapterPath(path: string): { mangaSlug: string; chapter: string } | null {
  const m = path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)-chapter-(.+?)\/?$/i);
  if (!m) return null;
  return { mangaSlug: m[1], chapter: m[2] };
}

export async function fetchChapter(
  chapterPath: string,
  opts: { nav?: boolean } = {},
): Promise<ChapterData> {
  const clean = "/" + chapterPath.replace(/^\/+|\/+$/g, "") + "/";
  const parsed = parseChapterPath(clean);
  if (!parsed) {
    throw new KomikuError("Format URL chapter tidak valid.", `${KOMIKU_BASE}${clean}`);
  }
  const html = await fetchHtml(`${KOMIKU_BASE}${clean}`);
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim();
  const images: string[] = [];
  $("#Baca_Komik img").each((_, img) => {
    const src = absUrl($(img).attr("src"));
    if (!src) return;
    if (/komiku-promosi/i.test(src)) return; // banner promosi Komiku
    images.push(src);
  });
  // Fallback sesuai onerror bawaan Komiku: imageN.komiku.to → img.komiku.org
  // (disimpan sebagai data agar frontend bisa retry bila CDN utama gagal).

  let prevUrl: string | undefined;
  let mangaUrl = "";
  $("div.toolbar a.btn[href]").each((_, a) => {
    const $a = $(a);
    const label = ($a.attr("aria-label") || "").toLowerCase();
    const href = toPath($a.attr("href"));
    if (label === "prev" && href.includes("-chapter-")) prevUrl = prevUrl ?? href;
    if (label === "list" && href.startsWith("/manga/")) mangaUrl = mangaUrl || href;
  });
  // Fallback: link chapter lain di halaman = chapter sebelumnya
  if (!prevUrl) {
    $("a[href*='-chapter-']").each((_, a) => {
      const href = toPath($(a).attr("href"));
      if (href !== clean && href.includes("-chapter-")) {
        prevUrl = href;
        return false;
      }
    });
  }
  const mangaSlug = mangaSlugFromPath(mangaUrl) || parsed.mangaSlug;
  if (!mangaUrl) mangaUrl = `/manga/${mangaSlug}/`;

  // Tetangga akurat dari daftar chapter (terbaru dulu):
  // index-1 = lebih baru (Next), index+1 = lebih lama (Prev).
  // Tanpa ini tombol Next hanya menebak "+1" — salah untuk chapter
  // desimal (11-2), chapter lompat, atau judul oneshot.
  // `nav: false` dipakai jalur merge: prev/next di sana ditulis ulang dari
  // daftar chapter gabungan, jadi scrape detail kedua ini murni pemborosan
  // (satu request upstream penuh per chapter yang dibuka).
  let nextUrl: string | undefined;
  if (opts.nav !== false) {
    try {
      const detailHtml = await fetchHtml(`${KOMIKU_BASE}/manga/${encodeURIComponent(mangaSlug)}/`);
      const $$ = cheerio.load(detailHtml);
      const list: string[] = [];
      $$("table#Daftar_Chapter tbody tr td.judulseries a[href]").each((_, a) => {
        const href = toPath($$(a).attr("href"));
        if (href && href.includes("-chapter-")) list.push(href);
      });
      const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
      const idx = list.findIndex((u) => norm(u) === norm(clean));
      if (idx > 0) nextUrl = list[idx - 1];
      // Koreksi Prev dari sumber yang sama bila ada (lebih tepercaya
      // daripada tebakan link halaman).
      if (idx >= 0 && idx + 1 < list.length) prevUrl = list[idx + 1];
    } catch {
      // Gagal memuat daftar chapter — navigasi tetap jalan dengan prevUrl
      // dari toolbar + tebakan Next di frontend.
    }
  }

  const chapterLabel =
    title.replace(new RegExp(`^${mangaSlug.replace(/-/g, " ")}\\s*`, "i"), "").trim() || title;

  if (!title || images.length === 0) {
    throw new KomikuError("Halaman chapter tidak memuat gambar yang dikenali.", `${KOMIKU_BASE}${clean}`);
  }

  return {
    title,
    mangaSlug,
    chapterLabel,
    images,
    ...(prevUrl ? { prevUrl } : {}),
    ...(nextUrl ? { nextUrl } : {}),
    mangaUrl,
  };
}

/* ------------------------------------------------------------------ */
/* Daftar genre (komiku.org/p/daftar-genre/)                           */
/* ------------------------------------------------------------------ */

export async function fetchGenres(): Promise<GenreRef[]> {
  const html = await fetchHtml(`${KOMIKU_BASE}/p/daftar-genre/`);
  const $ = cheerio.load(html);
  const genres: GenreRef[] = [];
  $("a.gnr[href]").each((_, a) => {
    const $a = $(a);
    const href = toPath($a.attr("href"));
    const m = href.match(/\/genre\/([^/]+)\/?/);
    const name = $a.find("b").first().text().trim();
    const countRaw = $a.find("i").first().text().trim().replace(/[^\d]/g, "");
    if (m && name) {
      genres.push({
        name,
        slug: m[1],
        ...(countRaw ? { count: parseInt(countRaw, 10) } : {}),
      });
    }
  });
  return genres;
}
