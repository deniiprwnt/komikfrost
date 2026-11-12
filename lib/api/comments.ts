/**
 * lib/api/comments.ts — komentar dari 3 sumber (Shinigami, Komiku, Komikcast).
 *
 * Prinsip:
 * - Satu sumber gagal/lambat TIDAK boleh merusak sumber lain.
 * - `loadComments` TIDAK PERNAH melempar error; selalu mengembalikan payload valid.
 * - Jika detail komik gagal diambil, semua sumber diberi status "unavailable".
 */
import * as cheerio from "cheerio";
import { getMangaDetail, komikuSlugForTitles, shiniIdForTitles } from "./manga";
import { fetchShiniChaptersAll, parseNumToken } from "./shinigami";
import { normalizeChapterKey, SOURCE_PRIORITY, type MergedMangaDetail } from "./aggregator";
import { createKeyedCache, withDataVersion } from "./cache";
import { proxiedImage } from "./img-proxy";
import type { CommentItem, CommentMedia, CommentsPayload, ComicSourceId, SourceComments } from "./types";

/* ------------------------------------------------------------------ */
/* ENDPOINT                                                            */
/* ------------------------------------------------------------------ */

const KC_BASE = "https://komikcast.top";
const KC_API = "https://komikcast.top/api/v1";
const KOMIKU_BASE = "https://komiku.org";
const SHINI_WALINE = "https://commento.shngm.io/comment";

/** Kandidat path Waline Shinigami. Situs aslinya memakai pathname (diawali "/"), jadi itu dicoba lebih dulu. */
const shiniPaths = (q: { mangaId: string; chapterId?: string }): string[] =>
  q.chapterId
    ? [`/chapter/${q.chapterId}`, `chapter/${q.chapterId}`]
    : [`/series/${q.mangaId}`, `series/${q.mangaId}`, `/manga/${q.mangaId}`, `manga/${q.mangaId}`];

const SHINI_PAGE_SIZE = 30;
const SHINI_MAX_PAGES = 80; // s.d. 2400 komentar top-level
const shiniUrl = (path: string, page: number): string =>
  `${SHINI_WALINE}?path=${encodeURIComponent(path)}&page=${page}&pageSize=${SHINI_PAGE_SIZE}&lang=en-US&sortBy=insertedAt_desc`;

interface KcIds {
  seriesId?: string;
  chapterId?: string;
  links: string[];
}

const kcCandidates = (q: { series: string; chapterSlug?: string }, ids: KcIds = { links: [] }): string[] => {
  const page = "page=1&per_page=30";
  const out: string[] = [...ids.links];
  if (q.chapterSlug) {
    const c = encodeURIComponent(q.chapterSlug);
    if (ids.chapterId) {
      const i = encodeURIComponent(ids.chapterId);
      out.push(
        `${KC_API}/chapters/${i}/comments?${page}`,
        `${KC_API}/comments?chapter_id=${i}&${page}`,
        `${KC_API}/comments?chapter=${i}&${page}`,
        `${KC_API}/comments?type=chapter&id=${i}&${page}`,
        `${KC_API}/comments?commentable_type=chapter&commentable_id=${i}&${page}`,
      );
    }
    out.push(
      `${KC_API}/chapters/${c}/comments?${page}`,
      `${KC_API}/comments?chapter=${c}&${page}`,
      `${KC_API}/comments?chapter_slug=${c}&${page}`,
      `${KC_API}/comments?type=chapter&slug=${c}&${page}`,
    );
  } else {
    if (ids.seriesId) {
      const i = encodeURIComponent(ids.seriesId);
      out.push(
        `${KC_API}/series/${i}/comments?${page}`,
        `${KC_API}/comments?series_id=${i}&${page}`,
        `${KC_API}/comments?series=${i}&${page}`,
        `${KC_API}/comments?type=series&id=${i}&${page}`,
        `${KC_API}/comments?commentable_type=series&commentable_id=${i}&${page}`,
      );
    }
    const s = encodeURIComponent(q.series);
    out.push(
      `${KC_API}/series/${s}/comments?${page}`,
      `${KC_API}/comments?series=${s}&${page}`,
      `${KC_API}/comments?series_slug=${s}&${page}`,
      `${KC_API}/comments?type=series&slug=${s}&${page}`,
    );
  }
  return [...new Set(out)];
};

const CUSTOM = {
  komikcast: { series: "", chapter: "" },
  komiku: { series: "", chapter: "" },
};

function fillTemplate(tpl: string, series: string, chapter?: string): string | null {
  if (!tpl) return null;
  return tpl
    .replaceAll("{series}", encodeURIComponent(series))
    .replaceAll("{chapter}", encodeURIComponent(chapter ?? ""));
}

/* ------------------------------------------------------------------ */
/* Util umum                                                           */
/* ------------------------------------------------------------------ */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 6_000;
const MAX_ITEMS = 30;
const MAX_TEXT = 1200;

type Trace = string[] | undefined;

async function fetchText(
  url: string,
  accept: string,
  referer?: string,
  trace?: Trace,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(withDataVersion(url), {
      headers: {
        "User-Agent": UA,
        Accept: accept,
        ...(referer ? { Referer: referer } : {}),
        ...(extraHeaders ?? {}),
      },
      signal: ctrl.signal,
      next: { revalidate: 60 },
    } as RequestInit & { next?: { revalidate: number } });
    trace?.push(`${res.status} ${url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (trace && !trace.some((t) => t.endsWith(url))) trace.push(`ERR(${e instanceof Error ? e.message : "?"}) ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#039;": "'",
  "&nbsp;": " ",
};

export function toPlainText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#0?39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT).trimEnd()}…` : s;
}

function safeAvatar(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let u = v.trim();
  if (!u) return undefined;
  if (u.startsWith("//")) u = "https:" + u;
  if (!/^https?:\/\//i.test(u) || u.length > 600) return undefined;
  return proxiedImage(u.replace(/^http:\/\//i, "https://")) || undefined;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const pick = (o: Rec, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

function toTs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && v.trim()) {
    if (/^\d{9,13}$/.test(v.trim())) return toTs(Number(v.trim()));
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

function findList(raw: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isRec(raw) || depth > 2) return null;
  for (const k of ["data", "comments", "items", "results", "list", "rows", "records"]) {
    if (k in raw) {
      const hit = findList(raw[k], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}


/* ------------------------------------------------------------------ */
/* Media di komentar (gambar / GIF / sticker)                          */
/* ------------------------------------------------------------------ */

const MAX_MEDIA = 8;
const BARE_IMG_URL = /https?:\/\/[^\s<>"')]+?\.(?:gif|png|jpe?g|webp|avif)(?:\?[^\s<>"')]*)?/gi;
const MD_IMG = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)[^)]*\)/g;

function mediaUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let u = v.trim();
  if (!u) return undefined;
  if (u.startsWith("//")) u = "https:" + u;
  u = u.replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(u) || u.length > 800) return undefined;
  return proxiedImage(u) || undefined;
}

/** Ambil <img> dari HTML komentar (Waline: gambar, GIF, emoji/sticker). */
function mediaFromHtml(html: string): CommentMedia[] {
  const out: CommentMedia[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcRaw = /\b(?:data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const src = mediaUrl(srcRaw?.replace(/&amp;/g, "&"));
    if (!src) continue;
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const emoji = /wl-emoji|emoji|sticker/i.test(tag);
    out.push({ src, kind: emoji ? "emoji" : "image", ...(alt ? { alt: alt.slice(0, 80) } : {}) });
  }
  return out;
}

/** Markdown ![](url) dan URL gambar telanjang di teks → media; URL-nya dibuang dari teks. */
function pullTextMedia(text: string): { text: string; media: CommentMedia[] } {
  const media: CommentMedia[] = [];
  const take = (u: string) => {
    const src = mediaUrl(u);
    if (src) media.push({ src, kind: "image" });
  };
  const t = text
    .replace(MD_IMG, (_m, u: string) => (take(u), ""))
    .replace(BARE_IMG_URL, (u: string) => (take(u), ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: t, media };
}

/** Field terstruktur (API Komiku dsb.): sticker / gif / gambar sebagai string atau objek. */
function mediaFromFields(raw: Rec): CommentMedia[] {
  const out: CommentMedia[] = [];
  const keys = ["images", "image_url", "image_urls", "attachments", "attachment", "media", "sticker", "stickers", "sticker_url", "gif", "gifs", "gif_url", "comment_image", "comment_images"];
  const visit = (v: unknown, kind: CommentMedia["kind"], depth = 0) => {
    if (depth > 2 || v == null) return;
    if (typeof v === "string") {
      const src = mediaUrl(v);
      if (src) out.push({ src, kind });
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x, kind, depth + 1);
    } else if (isRec(v)) {
      for (const k of ["url", "src", "image", "image_url", "original", "large", "path"]) {
        if (typeof v[k] === "string") return visit(v[k], kind, depth + 1);
      }
    }
  };
  for (const k of keys) {
    if (raw[k] === undefined) continue;
    visit(raw[k], /sticker|emoji/i.test(k) ? "emoji" : "image");
  }
  return out;
}

function dedupeMedia(list: CommentMedia[]): CommentMedia[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.src) ? false : (seen.add(m.src), true))).slice(0, MAX_MEDIA);
}

function mapComment(raw: unknown, source: ComicSourceId, idx: number, level = 0): CommentItem | null {
  if (!isRec(raw)) return null;
  const rawBody = pick(raw, ["content", "comment", "body", "text", "message", "comment_content", "isi"]);
  const rawStr = typeof rawBody === "string" ? rawBody : "";
  const pulled = pullTextMedia(toPlainText(rawBody));
  const text = pulled.text;
  const media = dedupeMedia([...mediaFromHtml(rawStr), ...pulled.media, ...mediaFromFields(raw)]);
  // Komentar berisi hanya gambar/sticker tetap dipertahankan.
  if (!text && media.length === 0) return null;
  const user = isRec(raw.user) ? raw.user : isRec(raw.author) ? raw.author : isRec(raw.member) ? raw.member : null;
  const nameRaw =
    (user && pick(user, ["name", "username", "display_name", "nickname", "full_name"])) ??
    pick(raw, ["nick", "user_name", "username", "author_name", "comment_author", "name", "member_display_name"]) ??
    (typeof raw.author === "string" ? raw.author : undefined);
  const author = toPlainText(typeof nameRaw === "string" ? nameRaw : "").slice(0, 60) || "Anonim";
  const avatar = safeAvatar(
    (user && pick(user, ["avatar", "avatar_url", "profile_image_url", "profile_picture", "photo", "picture", "image"])) ??
      pick(raw, ["avatar", "avatar_url", "user_avatar", "profile_image_url", "photo", "member_profile_image"]),
  );
  const likesRaw = pick(raw, ["like", "like_count", "likes", "upvote", "upvotes", "vote_count", "total_like"]);
  const likes = typeof likesRaw === "number" ? likesRaw : Number(likesRaw);
  const out: CommentItem = {
    id: String(pick(raw, ["id", "objectId", "comment_id", "_id", "uuid", "hash_id"]) ?? `${source}-${level}-${idx}`),
    source,
    author,
    text,
  };
  if (avatar) out.avatar = avatar;
  if (media.length) out.media = media;
  const ts = toTs(pick(raw, ["insertedAt", "created_at", "createdAt", "date", "created", "comment_date", "time", "timestamp"]));
  if (ts) out.createdAtTs = ts;
  if (Number.isFinite(likes) && likes > 0) out.likes = likes;
  if (level === 0) {
    const rep = pick(raw, ["replies", "children", "reply", "sub_comments", "child_comments"]);
    if (Array.isArray(rep)) {
      const list = rep
        .map((r, i) => mapComment(r, source, i, 1))
        .filter((r): r is CommentItem => r !== null)
        .slice(0, 100);
      if (list.length) out.replies = list;
    }
  }
  return out;
}

function normalizeJsonComments(raw: unknown, source: ComicSourceId, max: number = MAX_ITEMS): CommentItem[] | null {
  const list = findList(raw);
  if (!list) return null;
  return list
    .map((r, i) => mapComment(r, source, i))
    .filter((c): c is CommentItem => c !== null)
    .slice(0, max);
}

async function firstJsonList(
  urls: string[],
  source: ComicSourceId,
  referer?: string,
  trace?: Trace,
): Promise<CommentItem[] | null> {
  for (const url of urls) {
    try {
      const body = await fetchText(url, "application/json", referer, trace);
      const items = normalizeJsonComments(JSON.parse(body), source);
      trace?.push(items ? `  -> ${items.length} komentar` : `  -> JSON tanpa daftar komentar: ${body.slice(0, 120)}`);
      if (items) return items;
    } catch {
      // kandidat berikut
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Adapter per sumber                                                  */
/* ------------------------------------------------------------------ */

interface WalinePage {
  items: CommentItem[];
  totalPages: number;
  count: number;
}

function parseWalinePage(body: string): WalinePage | null {
  const json = JSON.parse(body) as unknown;
  const items = normalizeJsonComments(json, "shinigami", Infinity);
  if (!items) return null;
  const d = isRec(json) && isRec(json.data) ? json.data : null;
  const tp = d ? Number(d.totalPages) : NaN;
  const cnt = d ? Number(d.count) : NaN;
  return {
    items,
    totalPages: Number.isFinite(tp) && tp > 0 ? tp : 1,
    count: Number.isFinite(cnt) ? cnt : items.length,
  };
}

async function shinigamiComments(q: { mangaId: string; chapterId?: string }, trace?: Trace): Promise<SourceComments> {
  const referer = "https://11.shinigami.asia/";
  // 1) Cari path yang benar-benar berisi komentar (jangan berhenti di jawaban kosong).
  let hit: { path: string; first: WalinePage } | null = null;
  let reachable = false;
  for (const path of shiniPaths(q)) {
    try {
      const pg = parseWalinePage(await fetchText(shiniUrl(path, 1), "application/json", referer, trace));
      if (!pg) continue;
      reachable = true;
      trace?.push(`  -> path "${path}": ${pg.count} komentar, ${pg.totalPages} halaman`);
      if (pg.count > 0 || pg.items.length > 0) {
        hit = { path, first: pg };
        break;
      }
    } catch {
      // kandidat berikut
    }
  }
  if (!hit) return finish("shinigami", reachable ? [] : null);
  const found = hit;

  // 2) Ambil halaman 2..N. TIDAK bergantung pada totalPages (bisa hilang/beda format):
  //    lanjut sampai halaman kosong / tanpa komentar baru. Per 3 halaman paralel, dengan retry.
  const all: CommentItem[] = [...found.first.items];
  const seen = new Set(all.map((c) => c.id));
  const hinted = found.first.totalPages > 1 ? found.first.totalPages : Math.ceil(found.first.count / SHINI_PAGE_SIZE);
  const started = Date.now();
  let failedPages = 0;
  let done = found.first.items.length === 0;
  const loadPage = async (pg: number): Promise<WalinePage | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return parseWalinePage(await fetchText(shiniUrl(found.path, pg), "application/json", referer, trace));
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return null;
  };
  for (let from = 2; !done && from <= SHINI_MAX_PAGES && Date.now() - started < 20_000; from += 3) {
    const pages = [from, from + 1, from + 2].filter((n) => n <= SHINI_MAX_PAGES);
    const res = await Promise.all(pages.map(loadPage));
    for (const r of res) {
      if (!r) {
        failedPages++;
        continue;
      }
      let fresh = 0;
      for (const c of r.items) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        all.push(c);
        fresh++;
      }
      if (fresh === 0) done = true;
    }
    if (res.every((r) => !r)) break; // server menolak terus — jangan buang waktu
  }
  trace?.push(`  -> total ${all.length} komentar top-level (perkiraan ${found.first.count}, halaman gagal ${failedPages}, hint ${hinted} hlm)`);
  const out = finish("shinigami", all);
  if (failedPages > 0 || (found.first.count > all.length && all.length >= SHINI_MAX_PAGES * SHINI_PAGE_SIZE)) {
    out.message = `Sebagian komentar belum termuat (${all.length} dari ±${found.first.count}).`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Penemuan otomatis                                                   */
/* ------------------------------------------------------------------ */

const COMMENT_HINT = /comment|komentar|disqus|waline|commento|cusdis|giscus|utterances/i;
const STATIC_ASSET = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm)(?:[?#]|$)/i;

function isPublicHttps(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
  return true;
}

interface Discovered {
  waline?: string;
  disqus?: string;
  giscus: boolean;
  urls: string[];
}

export function discoverFromHtml(html: string, pageUrl: string): Discovered {
  const waline = html.match(/serverURL["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+)["']/i)?.[1];
  const disqus = html.match(/([a-z0-9-]+)\.disqus\.com\/embed\.js/i)?.[1];
  const giscus = /giscus\.app\/client\.js/i.test(html);
  const found = new Set<string>();
  const add = (raw: string) => {
    const v = raw.trim().replace(/&amp;/g, "&");
    if (!v || v.length > 400 || !COMMENT_HINT.test(v) || STATIC_ASSET.test(v) || /[{}$<>]/.test(v)) return;
    if (/disqus\.com|giscus\.app|utteranc\.es|gravatar\.com/i.test(v)) return;
    try {
      const u = new URL(v, pageUrl);
      if (isPublicHttps(u)) found.add(u.toString());
    } catch {
      /* abaikan */
    }
  };
  for (const m of html.matchAll(/\b(?:hx-(?:get|post)|data-(?:url|src|endpoint|api|load|href)|action)\s*=\s*["']([^"']+)["']/gi)) add(m[1]!);
  for (const m of html.matchAll(/["'`]((?:https?:)?\/\/[^"'`\s]{6,300}|\/[A-Za-z0-9_\-./?=&%]{3,300})["'`]/g)) add(m[1]!);
  return { ...(waline ? { waline } : {}), ...(disqus ? { disqus } : {}), giscus, urls: [...found].slice(0, 8) };
}

const describe = (d: Discovered) =>
  [d.waline ? `Waline ${d.waline}` : "", d.disqus ? `Disqus(${d.disqus})` : "", d.giscus ? "Giscus" : "", d.urls.length ? `url: ${d.urls.join(" , ")}` : ""]
    .filter(Boolean)
    .join(" | ") || "tidak ada sistem komentar dikenal";

async function walineComments(base: string, paths: string[], source: ComicSourceId, referer: string, trace?: Trace) {
  const root = base.replace(/\/+$/, "");
  const tail = "&page=1&pageSize=30&lang=en-US&sortBy=insertedAt_desc";
  const all = [...new Set(paths.flatMap((p) => [p, p.replace(/\/$/, ""), p.replace(/^\//, "")]))];
  return firstJsonList(all.map((pth) => `${root}/comment?path=${encodeURIComponent(pth)}${tail}`), source, referer, trace);
}

async function firstDiscovered(urls: string[], source: ComicSourceId, referer: string, trace?: Trace): Promise<CommentItem[] | null> {
  for (const url of urls) {
    try {
      const body = await fetchText(url, "application/json, text/html;q=0.9", referer, trace);
      const trimmed = body.trimStart();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const items = normalizeJsonComments(JSON.parse(body), source);
        trace?.push(items ? `  -> ${items.length} komentar (JSON)` : `  -> JSON tanpa daftar komentar`);
        if (items) return items;
      } else {
        const items = parseHtmlComments(body, source);
        trace?.push(items ? `  -> ${items.length} komentar (HTML)` : `  -> HTML tanpa wadah komentar`);
        if (items) return items;
      }
    } catch {
      /* kandidat berikut */
    }
  }
  return null;
}

const ROW_SEL = "li.comment, article.comment, div.comment, .comment-item, .komentar-item, li[id^='comment-'], div[id^='comment-'], .u-komentar, .entry-comment, .comment-box, .comments-list";
const BOX_SEL = "#comments, #Komentar, #komentar, .comments-area, section.comments, .komentar, .comment-list, #comment-list, .comments, .u-komentar-wrap, .comment-section";

export function parseHtmlComments(html: string, source: ComicSourceId): CommentItem[] | null {
  const $ = cheerio.load(html);
  let box = $(BOX_SEL).first();
  if (box.length === 0) {
    if ($(ROW_SEL).length === 0) return null;
    box = $("body");
  }
  const items: CommentItem[] = [];
  const read = ($c: cheerio.Cheerio<any>, idx: number, level: number): CommentItem | null => {
    const text = toPlainText($c.find(".comment-content, .comment-text, .comment-body, .isi-komentar, .komentar-isi, .content, p, .u-komentar-isi, .comment-detail, .isi").first().html() ?? "");
    if (!text) return null;
    const author = toPlainText($c.find(".fn, .comment-author, .author, .nama, .username, .u-komentar-penulis, .author-name, .comment-by").first().text()).slice(0, 60) || "Anonim";
    const ts = toTs($c.find("time[datetime]").first().attr("datetime"));
    const item: CommentItem = { id: $c.attr("id") || `${source}-${level}-${idx}`, source, author, text };
    const av = safeAvatar($c.find("img.avatar, .comment-author img, img[class*='avatar']").first().attr("src"));
    if (av) item.avatar = av;
    if (ts) item.createdAtTs = ts;
    return item;
  };
  box.find(ROW_SEL).toArray().forEach((el, i) => {
    const $el = $(el);
    if ($el.parents(ROW_SEL).length > 0) return;
    const top = read($el, i, 0);
    if (!top) return;
    const replies = $el
      .find(ROW_SEL)
      .toArray()
      .map((r, j) => read($(r), j, 1))
      .filter((r): r is CommentItem => r !== null)
      .slice(0, 20);
    if (replies.length) top.replies = replies;
    items.push(top);
  });
  return items.slice(0, MAX_ITEMS);
}

async function kcIds(q: { series: string; chapterSlug?: string }, trace?: Trace): Promise<KcIds> {
  const out: KcIds = { links: [] };
  const grab = async (url: string, isChapter: boolean) => {
    try {
      const json = JSON.parse(await fetchText(url, "application/json", KC_BASE + "/", trace)) as unknown;
      const data = isRec(json) && isRec(json.data) ? json.data : isRec(json) ? json : null;
      if (!data) return;
      const id = data.id ?? data.series_id ?? data.chapter_id ?? data.post_id;
      if (id != null) {
        if (isChapter) out.chapterId = String(id);
        else out.seriesId = String(id);
      }
      if (isChapter && isRec(data.series) && data.series.id != null) {
        out.seriesId = String(data.series.id);
      }
      const walk = (v: unknown, key: string, depth: number) => {
        if (depth > 3) return;
        if (typeof v === "string") {
          if (COMMENT_HINT.test(key) && /^(?:https:\/\/|\/)/.test(v) && !STATIC_ASSET.test(v)) {
            try {
              const u = new URL(v, KC_BASE);
              if (isPublicHttps(u)) out.links.push(u.toString());
            } catch {
              /* abaikan */
            }
          }
        } else if (isRec(v)) {
          for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
        }
      };
      walk(data, "", 0);
    } catch {
      /* ID opsional */
    }
  };
  await Promise.all([
    grab(`${KC_API}/series/${encodeURIComponent(q.series)}`, false),
    ...(q.chapterSlug ? [grab(`${KC_API}/chapters/${encodeURIComponent(q.chapterSlug)}`, true)] : []),
  ]);
  trace?.push(`  -> id: series=${out.seriesId ?? "?"} chapter=${out.chapterId ?? "?"} tautan komentar di JSON: ${out.links.length}`);
  return out;
}

async function komikcastComments(q: { series: string; chapterSlug?: string }, trace?: Trace): Promise<SourceComments> {
  const custom = fillTemplate(q.chapterSlug ? CUSTOM.komikcast.chapter : CUSTOM.komikcast.series, q.series, q.chapterSlug);
  if (custom) return finish("komikcast", await firstJsonList([custom], "komikcast", KC_BASE + "/", trace));

  const ids = await kcIds(q, trace);
  const viaApi = await firstJsonList(kcCandidates(q, ids), "komikcast", KC_BASE + "/", trace);
  if (viaApi) return finish("komikcast", viaApi);

  const pagePath = "/" + stripSlashes(q.chapterSlug ?? q.series) + "/";
  try {
    const html = await fetchText(`${KC_BASE}${pagePath}`, "text/html", KC_BASE + "/", trace);
    const inPage = parseHtmlComments(html, "komikcast");
    if (inPage) return finish("komikcast", inPage);
  } catch {
    /* tetap unavailable */
  }
  return finish("komikcast", null);
}

/* ------------------------------------------------------------------ */
/* Adapter Komiku via API internal                                     */
/* ------------------------------------------------------------------ */

const KOMIKU_MAX_PAGES = 15;

async function komikuApiComments(seriesId: string, chapterId: string | undefined, trace?: Trace): Promise<SourceComments> {
  const base = "https://plus.komiku.org/api/mobile/v1.0/comment/list";
  const fetchPage = async (page: number): Promise<CommentItem[] | null> => {
    const qs = new URLSearchParams({
      series_id: seriesId,
      ...(chapterId ? { chapter_id: chapterId } : {}),
      page: String(page),
      sort_type: "latest",
    });
    const body = await fetchText(`${base}?${qs.toString()}`, "application/json", KOMIKU_BASE + "/", trace, {
      "x-package-name": "id.komiku.plus",
      "x-version-code": "5",
    });
    return normalizeJsonComments(JSON.parse(body) as unknown, "komiku", Infinity);
  };
  try {
    const first = await fetchPage(1);
    trace?.push(first ? `  -> ${first.length} komentar (API, hlm 1)` : "  -> API tanpa daftar komentar");
    if (!first) return finish("komiku", null);
    const all: CommentItem[] = [...first];
    const seen = new Set(all.map((c) => c.id));
    const started = Date.now();
    // Lanjut ke halaman berikutnya sampai kosong / tidak ada komentar baru.
    for (let page = 2; first.length > 0 && page <= KOMIKU_MAX_PAGES && Date.now() - started < 12_000; page++) {
      let next: CommentItem[] | null;
      try {
        next = await fetchPage(page);
      } catch {
        break;
      }
      const fresh = (next ?? []).filter((c) => !seen.has(c.id));
      if (fresh.length === 0) break;
      for (const c of fresh) seen.add(c.id);
      all.push(...fresh);
      trace?.push(`  -> hlm ${page}: +${fresh.length}`);
    }
    return finish("komiku", all);
  } catch (e) {
    trace?.push(`  -> gagal API: ${e instanceof Error ? e.message : "?"}`);
    return finish("komiku", null);
  }
}

/* ------------------------------------------------------------------ */
/* Service gabungan                                                    */
/* ------------------------------------------------------------------ */

const commentCache = createKeyedCache<CommentsPayload>(60_000, 100);

function chapterKey(tok: string): string {
  const bare = tok.replace(/-bahasa-indonesia$/i, "").replace(/^(?:.*-)?chapter-/i, "") || tok;
  return normalizeChapterKey(bare)
    .replace(/^[.-]+/, "")
    .replace(/(\d)[.](\d)/g, "$1-$2");
}

const stripSlashes = (s: string) => s.replace(/^\/+|\/+$/g, "");

export async function getComments(slug: string, chapter?: string, debug = false): Promise<CommentsPayload> {
  const s = stripSlashes(slug);
  const c = chapter ? stripSlashes(chapter) : "";
  if (debug) return loadComments(s, c, true);
  return commentCache.load(
    `${s}/${c}`,
    () => loadComments(s, c),
    (p) => p.sources.every((x) => x.status !== "unavailable"),
  );
}

function bareToken(tok: string): string {
  return tok.replace(/-bahasa-indonesia$/i, "").replace(/^(?:.*-)?chapter-/i, "") || tok;
}

/**
 * Resolusi slug yang FAIL-SAFE: satu resolver error tidak menjatuhkan yang lain.
 */
async function resolveAllSlugs(merged: MergedMangaDetail): Promise<Partial<Record<ComicSourceId, string>>> {
  const slugs: Partial<Record<ComicSourceId, string>> = { ...(merged.sourceSlug ?? {}) };
  const aliases = [merged.title, merged.altTitle].filter((x): x is string => !!x && x.trim().length > 0);
  if (aliases.length === 0) return slugs;

  const safe = async (name: string, fn: () => Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false }> => {
    try {
      return { ok: true, value: await fn() };
    } catch {
      return { ok: false };
    }
  };

  const [shini, komiku] = await Promise.all([
    slugs.shinigami ? Promise.resolve({ ok: true, value: slugs.shinigami }) : safe("shini", () => shiniIdForTitles(aliases)),
    slugs.komiku ? Promise.resolve({ ok: true, value: slugs.komiku }) : safe("komiku", () => komikuSlugForTitles(aliases)),
  ]);

  if (shini.ok && typeof shini.value === "string") slugs.shinigami = shini.value;
  if (komiku.ok && typeof komiku.value === "string") slugs.komiku = komiku.value;
  return slugs;
}

async function loadComments(slug: string, chapter: string, debug = false): Promise<CommentsPayload> {
  // Fail-safe: jika detail komik gagal diambil, jangan lempar error — kembalikan payload valid.
  let merged: MergedMangaDetail;
  try {
    merged = (await getMangaDetail(slug)) as MergedMangaDetail;
  } catch {
    return unavailableAll("Gagal memuat detail komik.");
  }

  let slugs: Partial<Record<ComicSourceId, string>>;
  try {
    slugs = await resolveAllSlugs(merged);
  } catch {
    slugs = { ...(merged.sourceSlug ?? {}) };
  }

  const scope: CommentsPayload["scope"] = chapter ? "chapter" : "komik";

  const key = chapter ? chapterKey(chapter) : "";
  const item = key ? merged.chapters.find((ch) => chapterKey(ch.title) === key) : undefined;
  const refs = item?.sources ?? [];
  const ref = (src: ComicSourceId) => refs.find((r) => r.source === src);
  const bare = chapter ? bareToken(chapter) : "";

  const traces: Record<ComicSourceId, string[]> = { shinigami: [], komiku: [], komikcast: [] };
  const tr = (src: ComicSourceId): Trace => (debug ? traces[src] : undefined);

  const jobs: Record<ComicSourceId, () => Promise<SourceComments>> = {
    shinigami: async () => {
      const mangaId = slugs.shinigami
        ? slugs.shinigami
        : (await shiniIdForTitles([merged.title ?? "", merged.altTitle ?? ""])) ?? "";
      if (!mangaId) return finish("shinigami", null);
      if (!chapter) return shinigamiComments({ mangaId }, tr("shinigami"));
      let chapterId = ref("shinigami")?.chapterId;
      if (!chapterId) {
        const num = parseNumToken(bare);
        if (Number.isFinite(num)) {
          const rows = await fetchShiniChaptersAll(mangaId);
          chapterId = rows.find((r) => r.chapter_number === num)?.chapter_id;
        }
      }
      return chapterId
        ? shinigamiComments({ mangaId, chapterId }, tr("shinigami"))
        : none("shinigami", "Chapter ini tidak ada di Shinigami.");
    },
    komiku: async () => {
      const mangaSlug = slugs.komiku;
      if (!mangaSlug) return finish("komiku", null);

      const trace = tr("komiku");

      /** Baca data-series-id / data-chapter-id dari halaman Komiku. */
      const readIds = async (pageUrl: string) => {
        const html = await fetchText(pageUrl, "text/html", KOMIKU_BASE + "/", trace);
        const $ = cheerio.load(html);
        const el = $("[data-auto-preview='true']").first();
        return {
          series: el.attr("data-series-id") || undefined,
          chapter: el.attr("data-chapter-id") || undefined,
        };
      };

      // Halaman detail komik: Komiku menampilkan komentar seluruh seri
      // (chapter_id kosong) — data-series-id ada di halaman /manga/<slug>/.
      if (!chapter) {
        let seriesId: string | undefined;
        try {
          seriesId = (await readIds(`${KOMIKU_BASE}/manga/${mangaSlug}/`)).series;
        } catch {
          /* fallback: unavailable */
        }
        if (!seriesId) return finish("komiku", null);
        return komikuApiComments(seriesId, undefined, trace);
      }

      // Chapter: pakai URL chapter dari daftar gabungan — stem URL chapter
      // Komiku ("one-piece-chapter-1198") sering BEDA dari slug seri
      // ("komik-one-piece-indo"), jadi menebak dari slug seri gagal.
      const path = ref("komiku")?.url ?? "";
      const abs = (p: string) => (/^https?:\/\//i.test(p) ? p : `${KOMIKU_BASE}${p.startsWith("/") ? p : `/${p}`}`);
      const urls = [...(path ? [abs(path)] : []), `${KOMIKU_BASE}/${mangaSlug}-chapter-${bare}/`];
      for (const url of urls) {
        try {
          const ids = await readIds(url);
          if (ids.series && ids.chapter) return komikuApiComments(ids.series, ids.chapter, trace);
        } catch {
          /* kandidat berikut */
        }
      }
      trace?.push("  -> series_id/chapter_id tidak ditemukan di HTML");
      return finish("komiku", null);
    },
    // Komikcast tidak menyediakan komentar: halaman chapter/series-nya tidak
    // memuat wadah komentar (tanpa Disqus/Waline/Giscus) dan tidak ada
    // endpoint komentar di API-nya (semua kandidat /api/v1/*comment* → 404).
    // Jadi jangan tembak request yang pasti gagal; beri pesan yang jelas.
    // Komikcast tidak menyediakan komentar - DIVERIFIKASI ULANG dengan probe
    // (scripts/probe-kc-comments.mjs), bukan asumsi:
    //  - /api/v1/comments, /api/v1/comments?series_slug=..., ...?type=... dan
    //    /api/v1/chapters/<slug>/comments semuanya 404 ("The route api/v1/
    //    comments could not be found.").
    //  - Halaman chapter (200, ~103 KB) tidak memuat satu pun kemunculan
    //    "disqus", "waline", "giscus", "utteranc", "comment", "komentar".
    // Jangan menembak request yang pasti gagal dan JANGAN mengarang komentar.
    // Status "empty" + pesan jelas = satu-satunya jawaban jujur.
    komikcast: async () => none("komikcast", "Komikcast tidak menyediakan komentar."),
  };

  const results = await Promise.allSettled(
    SOURCE_PRIORITY.map((src) => {
      const job = jobs[src];
      if (!job) return Promise.resolve(none(src, "Komik ini tidak ditemukan di sumber ini."));
      return job().catch((e: unknown) =>
        e instanceof Error && /HTTP 404/.test(e.message)
          ? none(src, chapter ? "Chapter ini tidak ada di sumber ini." : "Komik ini tidak ada di sumber ini.")
          : finish(src, null),
      );
    }),
  );
  const sources = results.map((r, i) => (r.status === "fulfilled" ? r.value : finish(SOURCE_PRIORITY[i]!, null)));
  return {
    scope,
    sources,
    ...(debug
      ? {
          debug: {
            slugs: slugs as Record<string, string>,
            chapterSources: refs.map((r) => `${r.source}: ${r.url}${r.chapterId ? ` (id ${r.chapterId})` : ""}`),
            traces,
          },
        }
      : {}),
  };
}

function finish(source: ComicSourceId, items: CommentItem[] | null): SourceComments {
  if (items === null) {
    return { source, status: "unavailable", items: [], message: "Komentar belum bisa dimuat dari sumber ini." };
  }
  return { source, status: items.length ? "ok" : "empty", items };
}

function none(source: ComicSourceId, message: string): SourceComments {
  return { source, status: "empty", items: [], message };
}

function unavailableAll(message: string): CommentsPayload {
  return {
    scope: "komik",
    sources: SOURCE_PRIORITY.map((src) => ({
      source: src,
      status: "unavailable" as const,
      items: [],
      message,
    })),
  };
}