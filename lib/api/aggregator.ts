import type { ChapterItem, ChapterRef, GenreRef, KomikType, MangaCard, MangaDetail } from "./types";
// ID source terpusat di types (satu definisi, dipakai client + server).
import type { ComicSourceId } from "./types";
export type { ComicSourceId } from "./types";
import { canonicalGenre, themeDisplayName } from "./genre-canonical";
import { pickBestSynopsis } from "./text";
import { splitRating } from "./rating";

/**
 * Aggregator multi-source: Shinigami + Komiku → satu bentuk data gabungan.
 *
 * Alur: fetch paralel per source (partial failure: satu gagal ≠ semua gagal)
 * → normalisasi judul → dedupe → merge (SHINIGAMI utama, Komiku fallback
 * PER CHAPTER).
 *
 * Data asli tiap source TIDAK dihapus — disimpan di field `sources` /
 * `chapterSources` agar frontend bisa menampilkan badge & fallback.
 */

/** Tambah source baru = tambah satu nilai di types + scraper + entri priority. */

/**
 * URUTAN PRIORITAS FINAL — JANGAN DIBALIK:
 * SHINIGAMI SELALU UTAMA, Komiku fallback kedua, Komikcast fallback ketiga.
 * Semua merge (kartu/detail/chapter) memakai urutan ini — data Shinigami
 * menang bila tersedia; Komikcast hanya mengisi yang kosong di keduanya.
 */
export const SOURCE_PRIORITY: ComicSourceId[] = ["shinigami", "komiku", "komikcast"];

export const SOURCE_LABEL: Record<ComicSourceId, string> = {
  komiku: "Komiku",
  shinigami: "Shinigami",
  komikcast: "Komikcast",
};

/* ------------------------------------------------------------------ */
/* Aturan seleksi DETERMINISTIK (tanpa memori per instance)             */
/* ------------------------------------------------------------------ */

/**
 * Genre, tipe, sinopsis, dan sampul satu judul HARUS sama di semua bagian
 * situs (beranda, pencarian, ringkasan, detail, riwayat). Dulu konsistensi
 * dicoba lewat `Map` di memori proses (ingatan genre + record kanonis):
 * nilainya bergantung pada request mana yang kebetulan jalan lebih dulu di
 * instance serverless mana, sehingga label One Piece / DANDADAN berayun antar
 * reload. Sekarang SEMUA nilai diturunkan murni dari data sumber lewat
 * fungsi-fungsi di bawah, dengan prioritas tetap Shinigami → Komiku →
 * Komikcast. Input sama ⇒ output sama, di instance mana pun.
 */

/** Koreksi ejaan judul yang diketahui salah di sumber (tampil + dedupe). */
const TITLE_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bAlbrechtrecht\b/gi, "Albrecht"],
];

/** Judul untuk DITAMPILKAN: koreksi ejaan sumber diterapkan. */
export function fixTitle(raw: string): string {
  let s = raw;
  for (const [re, to] of TITLE_FIXES) s = s.replace(re, to);
  return s;
}

/**
 * Identitas FILE sampul. Dua URL yang menunjuk file gambar yang sama harus
 * menghasilkan identitas yang sama walau berbeda:
 *  - bungkus proxy (/api/img?u=...), termasuk yang ter-encode ganda;
 *  - protokol (http/https/protokol-relatif), `www.`, port, query, fragment;
 *  - host cadangan (thumbnail.komiku.to/.org, imageN.komiku.to, img.komiku.org;
 *    assets/cdn.shngm.*) dan CDN gambar pembungkus (i0.wp.com/<host>/...);
 *  - varian ukuran ("-300x400", "_150x150", "-scaled", "-thumb", segmen
 *    "/w300/", "/300x400/") dan ekstensi (jpg/jpeg/png/webp/avif).
 */
export function coverIdentity(raw?: string | null): string {
  let u = (raw ?? "").trim();
  if (!u) return "";
  // Buka bungkus proxy (maks 2 lapis).
  for (let i = 0; i < 2 && u.startsWith("/api/img"); i++) {
    const m = u.match(/[?&]u=([^&]+)/);
    if (!m) return "";
    try {
      u = decodeURIComponent(m[1]);
    } catch {
      return "";
    }
  }
  if (u.startsWith("//")) u = "https:" + u;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[\w.-]+\.[a-z]{2,}\//i.test(u)) u = "https://" + u;
  try {
    const p = new URL(u);
    let host = p.hostname.toLowerCase().replace(/^www\./, "");
    let path = p.pathname;
    // CDN pembungkus gambar: i0.wp.com/<host-asli>/<path>
    if (/^i\d\.wp\.com$/.test(host)) {
      const m = path.match(/^\/([^/]+)(\/.*)$/);
      if (m) {
        host = m[1].toLowerCase().replace(/^www\./, "");
        path = m[2];
      }
    }
    // Keluarga host yang menyajikan file yang sama.
    if (/^(thumbnail|img|image\d*)\.komiku\.(to|org|com)$/.test(host)) host = "komiku-img";
    else if (/(^|\.)shngm\.(id|io|co)$/.test(host)) host = "shngm-img";
    try {
      path = decodeURIComponent(path);
    } catch {
      // biarkan apa adanya
    }
    path = path
      .toLowerCase()
      .replace(/\/{2,}/g, "/")
      .replace(/\/(?:w|h|width|height)[-_]?\d{2,4}(?=\/)/g, "") // /w300/
      .replace(/\/\d{2,4}x\d{2,4}(?=\/)/g, "") // /300x400/
      .replace(/\.(?:jpe?g|png|webp|avif|gif)$/, "")
      .replace(/[-_]\d{2,4}x\d{2,4}$/, "")
      .replace(/[-_](?:scaled|thumb(?:nail)?|small|medium|large|cover|full|resized?)$/, "")
      .replace(/\/+$/, "");
    return path ? `${host}${path}` : "";
  } catch {
    return "";
  }
}

/** Sampul placeholder/spacer — tidak boleh dipakai sebagai bukti judul sama. */
function isPlaceholderCover(raw?: string | null): boolean {
  const u = (raw ?? "").trim().toLowerCase();
  if (!u || u.startsWith("data:")) return true;
  return /placeholder|no-?image|no_?cover|default|blank|spacer|lazy/.test(coverIdentity(u) || u);
}

/**
 * Kunci identitas kartu untuk dedupe LINTAS daftar (mis. Update terbaru vs
 * Rekomendasi di beranda): judul ternormalisasi (dedupeKey, termasuk alias)
 * dan identitas file sampul (bila bukan placeholder).
 */
export function cardIdentityKeys(c: Pick<MangaCard, "title" | "thumbnail">): string[] {
  const keys: string[] = [];
  const t = dedupeKey(c.title ?? "");
  if (t) keys.push(`t:${t}`);
  if (c.thumbnail && !isPlaceholderCover(c.thumbnail)) {
    const id = coverIdentity(c.thumbnail);
    if (id) keys.push(`c:${id}`);
  }
  return keys;
}

/** Sumber genre: detail membawa `genres` (urut), kartu hanya `genre`. */
export interface GenreSource {
  genres?: GenreRef[];
  genre?: string;
}

/**
 * Genre UTAMA = `genres[0]` dari sumber berprioritas TERTINGGI yang punya
 * genre valid (dikenal kanonis). Tema bukan Genre: Tema adalah field
 * terpisah (`theme`) dan tidak pernah masuk di sini. Untuk kartu daftar
 * (hanya `genre` satu label) label itu diperlakukan sebagai `genres[0]`.
 * `list` = daftar genre sumber pemenang dengan urutan aslinya.
 */
export function pickPrimaryGenre(
  by: Partial<Record<ComicSourceId, GenreSource | undefined>>,
): { genre: GenreRef; source: ComicSourceId; list: GenreRef[] } | undefined {
  for (const s of SOURCE_PRIORITY) {
    const src = by[s];
    if (!src) continue;
    const list: GenreRef[] = [];
    const seen = new Set<string>();
    const push = (raw?: string | null) => {
      const c = canonicalGenre(raw);
      if (!c || seen.has(c.slug)) return;
      seen.add(c.slug);
      list.push({ name: c.name, slug: c.slug });
    };
    if (src.genres?.length) {
      for (const g of src.genres) push(g.name) ;
      if (list.length === 0) for (const g of src.genres) push(g.slug);
    } else {
      push(src.genre);
    }
    if (list.length > 0) return { genre: list[0], source: s, list };
  }
  return undefined;
}

/** Batas genre tambahan dari sumber non-pemenang (lihat extendGenreList). */
export const EXTRA_GENRE_MAX = 2;

/**
 * Daftar genre detail = genre sumber PEMENANG (urutan asli, label utama
 * tetap list[0]) + maksimal EXTRA_GENRE_MAX genre tambahan dari field
 * `genres` sumber lain (urutan prioritas, hanya yang belum ada). Field
 * `theme` TIDAK pernah dipakai sebagai tambahan. Kartu tetap memakai
 * `genre` = list[0] saja, jadi label utama sama di pencarian dan detail.
 */
export function extendGenreList(
  by: Partial<Record<ComicSourceId, GenreSource | undefined>>,
  pick: { source: ComicSourceId; list: GenreRef[] } | undefined,
  max = EXTRA_GENRE_MAX,
): GenreRef[] {
  if (!pick) return [];
  const out = [...pick.list];
  const seen = new Set(out.map((g) => g.slug));
  let added = 0;
  for (const s of SOURCE_PRIORITY) {
    if (s === pick.source || added >= max) continue;
    for (const g of by[s]?.genres ?? []) {
      if (added >= max) break;
      const c = canonicalGenre(g?.name) ?? canonicalGenre(g?.slug);
      if (!c || seen.has(c.slug)) continue;
      seen.add(c.slug);
      out.push({ name: c.name, slug: c.slug });
      added++;
    }
  }
  return out;
}

/**
 * Chapter terbaru lintas sumber: nomor TERTINGGI menang; nomor sama →
 * sumber berprioritas lebih tinggi (urutan SOURCE_PRIORITY). Tak ada nomor
 * yang terparse → sumber berprioritas tertinggi yang punya chapter.
 */
export function pickLatest<T extends { label: string }>(
  by: Partial<Record<ComicSourceId, T | undefined>>,
): { ref: T; source: ComicSourceId } | undefined {
  let best: { ref: T; source: ComicSourceId; n: number } | undefined;
  let firstAny: { ref: T; source: ComicSourceId } | undefined;
  for (const s of SOURCE_PRIORITY) {
    const ref = by[s];
    if (!ref) continue;
    if (!firstAny) firstAny = { ref, source: s };
    const n = chapterNum(ref.label);
    if (Number.isFinite(n) && (!best || n > best.n)) best = { ref, source: s, n };
  }
  return best ? { ref: best.ref, source: best.source } : firstAny;
}

/**
 * Tipe komik kanonis (Manga/Manhwa/Manhua) dari teks mentah sumber
 * ("manhwa", "MANHUA", "Manhwa (KR)", "Komik Manga"). Selain tiga nilai itu
 * (mis. "Comic", "Novel", "Webtoon") dianggap TIDAK punya tipe.
 */
export function normalizeKomikType(raw?: string | null): KomikType | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return undefined;
  if (/\bmanhwa\b/.test(v)) return "Manhwa";
  if (/\bmanhua\b/.test(v)) return "Manhua";
  if (/\bmanga\b/.test(v)) return "Manga";
  return undefined;
}

/**
 * Tipe = milik sumber berprioritas TERTINGGI yang punya tipe valid
 * (Shinigami → Komiku → Komikcast). Sumber berikutnya dipakai HANYA bila
 * sumber pemenang tidak punya tipe. Satu fungsi ini dipakai mergeCards,
 * mergeDetails, getMangaSummary, dan enrich kartu — jadi tipe satu judul
 * sama di Update terbaru, Rekomendasi, Peringkat, pencarian, dan detail.
 */
export function pickType(
  by: Partial<Record<ComicSourceId, { type?: string | null } | undefined>>,
): { type: KomikType; source: ComicSourceId } | undefined {
  for (const s of SOURCE_PRIORITY) {
    const t = normalizeKomikType(by[s]?.type);
    if (t) return { type: t, source: s };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Normalisasi judul                                                    */
/* ------------------------------------------------------------------ */

/**
 * Normalisasi judul untuk matching lintas source:
 * - lowercase + trim + multiple-spaces → satu spasi
 * - tanda hubung/underscore/dash variants → spasi
 * - tanda baca non-alfanumerik dihapus ("One Piece!" → "one piece")
 * - unicode quotes/diacritics dinormalisasi ("I’m" → "im")
 *
 * Konservatif: TIDAK ada fuzzy/levenshtein — hanya exact match hasil
 * normalisasi yang dianggap sama.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritik
    .replace(/[’‘`´]/g, "'")
    .replace(/[\u2010-\u2015\u2212\-_]+/g, " ") // semua varian dash/underscore → spasi
    .replace(/[^a-z0-9\s]/g, " ") // tanda baca → spasi
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kunci DEDUPE judul: normalizeTitle + buang ekor penanda duplikat yang
 * ditambahkan sumber untuk membedakan slug ("-id", "-id2", " id 3").
 *
 * Latar: sumber yang sama kadang memuat satu judul dua kali dengan slug
 * berbeda ("sumisaka-san" dan "sumisaka-san-id") sehingga setelah
 * ternormalisasi menjadi dua kunci berbeda dan judul tampil ganda. Hanya
 * ekor penanda yang dibuang; judul yang memang berakhiran kata "id" tetap
 * aman karena polanya menuntut pemisah + angka/akhir.
 */
/**
 * Judul yang diketahui sama tetapi ditulis berbeda antar sumber (romaji vs
 * Inggris). Kunci = hasil normalizeTitle; nilai = kunci kanonis bersama.
 * Hanya pasangan yang terbukti sama — bukan fuzzy.
 */
const TITLE_ALIAS_KEYS: ReadonlyMap<string, string> = new Map([
  ["mousouchu", "wild delusions"],
  ["mousou chu", "wild delusions"],
]);

export function dedupeKey(raw: string): string {
  // Ekor rentang chapter dalam kurung ("Sumisaka-san (1-5)") bukan bagian
  // judul — dibuang SEBELUM normalizeTitle (yang menghapus tanda kurung,
  // sehingga pola ini tidak akan pernah cocok bila dijalankan sesudahnya).
  // Koreksi ejaan judul yang diketahui salah ("Albrechtrecht") juga dilakukan
  // di sini agar varian ejaan jatuh ke grup yang sama.
  const stripped = fixTitle(raw)
    .replace(/\s*[(\[]\s*\d+\s*[-\u2010-\u2015]\s*\d+\s*[)\]]\s*$/, "")
    .replace(/\s*[(\[]\s*(?:id|indo(?:nesia)?)\s*\d*\s*[)\]]\s*$/i, "");
  const t = normalizeTitle(stripped);
  if (!t) return "";
  const k = t.replace(/\s+id\s*\d*$/, "").trim() || t;
  return TITLE_ALIAS_KEYS.get(k) ?? k;
}

/**
 * Himpunan kunci judul (judul + alias) untuk pencocokan lintas sumber:
 * tiap nilai lewat `dedupeKey` (normalizeTitle + buang ekor "-id"/rentang
 * chapter). Dua judul dianggap sama bila himpunan kuncinya BERIRISAN.
 * Exact — tidak ada fuzzy.
 */
export function aliasKeys(...titles: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const t of titles) {
    if (!t) continue;
    const k = dedupeKey(t);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** "Chapter 224" / "Ch. 224" → "224" (kunci dedupe chapter). */
export function normalizeChapterKey(raw: string): string {
  // Subjudul dibuang SEBELUM tanda baca dibersihkan: "Chapter 180: End" dan
  // "Chapter 12 - Tamat" harus menghasilkan kunci yang SAMA dengan
  // "Chapter 180"/"Chapter 12" dari sumber lain. Tanpa ini kuncinya jadi
  // "180end" ≠ "180" dan chapter yang sama tampil dua kali di daftar.
  const t = raw
    .toLowerCase()
    .replace(/[<>]/g, "") // sisa tag <chapter> literal — isi angka dipertahankan
    .replace(/^(chapter|ch\.?|episode|eps\.?)\s*/i, "")
    .split(":")[0]
    .split(" - ")[0]
    .split(" – ")[0]
    .split(" — ")[0]
    .replace(/[^a-z0-9.\-]/g, "")
    .trim();
  return t;
}

/* ------------------------------------------------------------------ */
/* Tipe gabungan (extends tipe lama, non-breaking)                      */
/* ------------------------------------------------------------------ */

/** Referensi chapter dari satu source tertentu. */
export interface ChapterSourceRef {
  source: ComicSourceId;
  /** path/url chapter di source asalnya */
  url: string;
  /** ID chapter native (Shinigami) — bila ada, reader skip chapter-list. */
  chapterId?: string;
}

/**
 * Chapter gabungan: satu label + daftar source penyedia.
 * `url` = url source prioritas (Shinigami bila ada) — dipakai link default
 * agar komponen lama (chapterPathToRoute) tetap jalan tanpa perubahan.
 */
export interface MergedChapterItem extends ChapterItem {
  sources: ChapterSourceRef[];
}

/**
 * Kartu gabungan: field lama (slug/title/thumbnail/...) = data source
 * prioritas; `sources` mencatat semua source penyedia.
 * `sourceSlug` = slug di tiap source (untuk fetch detail per source).
 * Slug tampilan = slug Komiku bila ada (URL manusiawi), else ID Shinigami.
 */
export interface MergedMangaCard extends MangaCard {
  /** Sumber pemenang genre utama (lihat pickPrimaryGenre). */
  genreSource?: ComicSourceId;
  /** Sumber pemenang tipe (lihat pickType). */
  typeSource?: ComicSourceId;
  sources: ComicSourceId[];
  sourceSlug: Partial<Record<ComicSourceId, string>>;
}

/** Detail gabungan: chapters = MergedChapterItem[] (compatible: subtype). */
export interface MergedMangaDetail extends Omit<MangaDetail, "chapters"> {
  sources: ComicSourceId[];
  sourceSlug: Partial<Record<ComicSourceId, string>>;
  chapters: MergedChapterItem[];
}

/* ------------------------------------------------------------------ */
/* Merge kartu                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gabungkan daftar kartu dari beberapa source → kartu unik.
 * Matching: normalizeTitle exact (TIDAK menggabungkan dua judul
 * ternormalisasi berbeda walau mirip). Jembatan tambahan: dua grup
 * yang berbagi altTitle (EN) yang SAMA PERSIS ikut digabung (exact,
 * bukan fuzzy) — menangani upstream yang memotong judul utama
 * ("...Desu" → "...Des") tapi menyimpan judul EN lengkap yang identik.
 */
export function mergeCards(lists: Partial<Record<ComicSourceId, MangaCard[]>>): MergedMangaCard[] {
  const groups = new Map<
    string,
    { cards: Partial<Record<ComicSourceId, MangaCard>>; pin?: MangaCard }
  >();
  // Bobot "jumlah chapter": nomor chapter terbaru. Entri dengan chapter
  // terbanyak menang saat satu judul muncul ganda.
  const weight = (c?: MangaCard): number => {
    const n = chapterNum(c?.latestChapter?.label);
    return Number.isFinite(n) ? n : -1;
  };
  const fixCard = (c: MangaCard): MangaCard => {
    const title = fixTitle(c.title);
    const alt = c.altTitle ? fixTitle(c.altTitle) : undefined;
    return title === c.title && alt === c.altTitle
      ? c
      : { ...c, title, ...(alt ? { altTitle: alt } : {}) };
  };
  const keyOf = (c: MangaCard): string => {
    const t = dedupeKey(c.title);
    return t ? `t:${t}` : "";
  };
  const altKeyOf = (c: MangaCard): string => {
    const a = c.altTitle ? dedupeKey(c.altTitle) : "";
    return a && a !== dedupeKey(c.title) ? `t:${a}` : "";
  };
  // Pass 1: grup per judul utama.
  for (const s of SOURCE_PRIORITY) {
    for (const raw of lists[s] ?? []) {
      const c = fixCard(raw);
      const gkey = keyOf(c);
      if (!gkey) continue;
      let g = groups.get(gkey);
      if (!g) {
        g = { cards: {} };
        groups.set(gkey, g);
      }
      // Satu source satu slot — duplikat dalam source yang sama: entri
      // dengan chapter TERBANYAK menang (seri → yang muncul lebih dulu).
      const cur = g.cards[s];
      if (!cur || weight(c) > weight(cur)) g.cards[s] = c;
    }
  }
  // Pass 2: satukan grup-grup yang berbagi altKey SAMA PERSIS.
  // Grup penyerap = grup yang pertama dikenal (prioritas judul Shinigami).
  const altIndex = new Map<string, string[]>();
  for (const [k, g] of groups) {
    for (const s of SOURCE_PRIORITY) {
      const c = g.cards[s];
      if (!c) continue;
      const ak = altKeyOf(c);
      if (!ak) continue;
      const arr = altIndex.get(ak);
      if (arr && !arr.includes(k)) arr.push(k);
      else if (!arr) altIndex.set(ak, [k]);
    }
  }
  const absorbed = new Set<string>();
  for (const [, keys] of altIndex) {
    if (keys.length < 2) continue;
    const target = keys[0];
    const tg = groups.get(target);
    if (!tg) continue;
    for (const k of keys.slice(1)) {
      if (k === target || absorbed.has(k)) continue;
      const g = groups.get(k);
      if (!g) continue;
      for (const s of SOURCE_PRIORITY) {
        if (g.cards[s] && !tg.cards[s]) tg.cards[s] = g.cards[s]!;
      }
      absorbed.add(k);
    }
  }
  // Pass 3: judul yang hanya beda EKOR sangat pendek akibat typo upstream
  // (mis. "...Albrecht" vs "...Albrechtrecht"). Konservatif: kunci pendek
  // minimal 9 huruf, sisa <= 3 huruf, dan judul panjang tidak berakhir
  // angka ("One Piece 2" bukan duplikat "One Piece"). Grup penyerap = yang
  // lebih pendek; slot sumber yang sudah terisi tidak ditimpa.
  {
    const keys = [...groups.keys()]
      .filter((k) => !absorbed.has(k))
      .sort((a, b) => a.length - b.length);
    for (let i = 0; i < keys.length; i++) {
      const shortK = keys[i];
      if (absorbed.has(shortK)) continue;
      const gs = groups.get(shortK);
      if (!gs || shortK.length < 9) continue;
      for (let j = i + 1; j < keys.length; j++) {
        const longK = keys[j];
        if (absorbed.has(longK)) continue;
        if (longK.length - shortK.length > 3) continue;
        if (!longK.startsWith(shortK)) continue;
        if (/\d$/.test(longK)) continue;
        const gl = groups.get(longK);
        if (!gl) continue;
        for (const src of SOURCE_PRIORITY) {
          if (gl.cards[src] && !gs.cards[src]) gs.cards[src] = gl.cards[src]!;
        }
        absorbed.add(longK);
      }
    }
  }
  // Pass 3b: SAMPUL IDENTIK + RENTANG CHAPTER TUMPANG TINDIH. Dua grup yang
  // menunjuk file sampul yang sama (setelah normalisasi host, protokol,
  // parameter, dan varian ukuran — lihat coverIdentity) dan rentang
  // chapternya beririsan adalah judul yang sama walau ejaan/slug-nya beda
  // (mis. varian "Sumisaka-san" ganda). Penyerap = grup dengan chapter
  // TERBANYAK; kartu dengan chapter terbanyak (seri → sumber berprioritas
  // lebih tinggi) menentukan judul/slug tampilan. Pengaman: sampul
  // placeholder diabaikan dan satu sampul yang dipakai >4 grup dianggap
  // generik.
  {
    const live = [...groups.keys()].filter((k) => !absorbed.has(k));
    // Rentang chapter grup: [awal, terbaru] lintas semua sumbernya. Awal
    // yang tak diketahui dianggap Chapter 1 (seri dimulai dari awal).
    // null = tak ada data chapter sama sekali (tidak bisa dibandingkan).
    const rangeOf = (k: string): { lo: number; hi: number } | null => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of SOURCE_PRIORITY) {
        const c = groups.get(k)!.cards[s];
        if (!c) continue;
        const f = chapterNum(c.firstChapter?.label);
        const l = chapterNum(c.latestChapter?.label);
        if (Number.isFinite(f)) lo = Math.min(lo, f);
        if (Number.isFinite(l)) hi = Math.max(hi, l);
      }
      if (!Number.isFinite(hi)) return null;
      if (!Number.isFinite(lo) || lo > hi) lo = Math.min(CHAPTER_SUB_BASE, hi);
      return { lo, hi };
    };
    const overlaps = (a: string, b: string): boolean => {
      const ra = rangeOf(a);
      const rb = rangeOf(b);
      if (!ra || !rb) return true; // tanpa data chapter: sampul sama sudah cukup kuat
      return ra.lo <= rb.hi && rb.lo <= ra.hi;
    };
    // Bobot grup = nomor chapter terbaru tertinggi lintas sumbernya.
    const groupWeight = (k: string): number =>
      Math.max(-1, ...SOURCE_PRIORITY.map((s) => weight(groups.get(k)!.cards[s])));
    const byCover = new Map<string, string[]>();
    for (const k of live) {
      const ids = new Set<string>();
      const g = groups.get(k)!;
      for (const s of SOURCE_PRIORITY) {
        const c = g.cards[s];
        if (!c) continue;
        for (const th of [c.thumbnail, ...(c.thumbnailCandidates ?? [])]) {
          if (!th || isPlaceholderCover(th)) continue;
          const id = coverIdentity(th);
          if (id) ids.add(id);
        }
      }
      for (const id of ids) {
        const arr = byCover.get(id);
        if (arr) arr.push(k);
        else byCover.set(id, [k]);
      }
    }
    const parent = new Map<string, string>(live.map((k) => [k, k]));
    const find = (k: string): string => {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const [, ks] of byCover) {
      // >8 grup berbagi satu sampul = sampul generik, jangan disentuh.
      if (ks.length < 2 || ks.length > 8) continue;
      for (let a = 0; a < ks.length; a++) {
        for (let b = a + 1; b < ks.length; b++) {
          if (!overlaps(ks[a], ks[b])) continue;
          // 5-8 grup: sampul sama saja belum cukup; wajib nomor chapter
          // terbaru yang sama persis. 2-4 grup: sampul sama + rentang
          // chapter beririsan (juga mencakup sampul sama + chapter sama).
          if (ks.length > 4) {
            const wa = groupWeight(ks[a]);
            if (wa < 0 || wa !== groupWeight(ks[b])) continue;
          }
          const ra = find(ks[a]);
          const rb = find(ks[b]);
          if (ra !== rb) parent.set(rb, ra);
        }
      }
    }
    const comps = new Map<string, string[]>();
    for (const k of live) {
      const r = find(k);
      const arr = comps.get(r);
      if (arr) arr.push(k);
      else comps.set(r, [k]);
    }
    for (const [, ks] of comps) {
      if (ks.length < 2) continue;
      const ordered = [...ks].sort(
        (a, b) =>
          groupWeight(b) - groupWeight(a) ||
          SOURCE_PRIORITY.filter((s) => groups.get(b)!.cards[s]).length -
            SOURCE_PRIORITY.filter((s) => groups.get(a)!.cards[s]).length ||
          a.localeCompare(b),
      );
      const target = ordered[0];
      const tg = groups.get(target)!;
      for (const k of ordered.slice(1)) {
        const g = groups.get(k)!;
        for (const s of SOURCE_PRIORITY) {
          const o = g.cards[s];
          if (!o) continue;
          const cur = tg.cards[s];
          if (!cur || weight(o) > weight(cur)) tg.cards[s] = o;
        }
        absorbed.add(k);
      }
      // Kartu dengan chapter terbanyak = identitas tampilan (judul/slug);
      // seri → sumber berprioritas lebih tinggi (urutan SOURCE_PRIORITY).
      let pin: MangaCard | undefined;
      for (const s of SOURCE_PRIORITY) {
        const c = tg.cards[s];
        if (c && (!pin || weight(c) > weight(pin))) pin = c;
      }
      if (pin) tg.pin = pin;
    }
  }
  for (const k of absorbed) groups.delete(k);

  const out: MergedMangaCard[] = [];
  for (const [, g] of groups) {
    const present = SOURCE_PRIORITY.filter((s) => g.cards[s]);
    const slugs: Partial<Record<ComicSourceId, string>> = {};
    for (const s of present) slugs[s] = g.cards[s]!.slug;

    // Slug tampilan = slug manusiawi (Komiku, lalu Komikcast) bila ada agar
    // route /komik/<slug> tetap valid; else ID Shinigami (UUID).
    const displaySlug = g.cards.komiku?.slug ?? g.cards.komikcast?.slug ?? g.cards[present[0]]!.slug;
    const primary = present[0];
    const p = g.cards[primary]!;
    const getCard = <K extends keyof MangaCard>(k: K): MangaCard[K] | undefined => {
      for (const s of SOURCE_PRIORITY) {
        const v = g.cards[s]?.[k];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
      }
      return undefined;
    };
    // Genre utama = genres[0] sumber prioritas tertinggi yang valid; tipe =
    // sumber prioritas tertinggi yang punya tipe; sinopsis = KUALITAS terbaik
    // dari semua sumber. Murni fungsi dari data kartu — tanpa memori proses.
    const genrePick = pickPrimaryGenre(g.cards);
    const typePick = pickType(g.cards);
    const genreName = genrePick?.genre.name;
    const mergedType = typePick?.type;
    const synopsisText = pickBestSynopsis(SOURCE_PRIORITY.map((s) => g.cards[s]?.synopsis));
    // Kandidat cover lintas sumber (prioritas dulu): klien mencoba berurutan
    // bila cover utama gagal dimuat, dan kotak error baru muncul bila semua
    // kandidat sudah dicoba.
    const thumbCandidates: string[] = [];
    const pushThumb = (v?: string) => {
      if (v && !thumbCandidates.includes(v)) thumbCandidates.push(v);
    };
    for (const s of SOURCE_PRIORITY) {
      pushThumb(g.cards[s]?.thumbnail);
      // Kandidat per-sumber (portrait/landscape) ikut dirantai â€” dulu hanya
      // `thumbnail` satu per sumber sehingga URL cadangan terbuang.
      for (const v of g.cards[s]?.thumbnailCandidates ?? []) pushThumb(v);
    }
    // firstChapter: Komiku (dari HTML, nomor asli) menang atas tebakan
    // "Chapter 1" kartu list Shinigami; fallback ke getCard bila Komiku absen.
    // Koreksi: bila pemenang bernomor > 1 dari kartu Komikcast (tebakan
    // latest − count + 1, katalog parsial) SEMENTARA kartu gabungan juga
    // punya Komiku/Shinigami (katalog penuh) → turunkan ke Chapter 1
    // dengan URL pola source prioritas. Kartu komikcast-only tak tersentuh.
    let firstCh = g.cards.komiku?.firstChapter ?? getCard("firstChapter");
    {
      const n = chapterNum(firstCh?.label);
      const kcFirst = g.cards.komikcast?.firstChapter;
      const fromKcGuess =
        !!firstCh && !!kcFirst && firstCh.url === kcFirst.url && Number.isFinite(n) && (n as number) > 1;
      const fullSlug = g.cards.komiku?.slug ?? g.cards.shinigami?.slug;
      if (fromKcGuess && fullSlug) {
        firstCh = { label: "Chapter 1", url: `/${fullSlug}-chapter-1/` };
      }
    }
    // latestChapter lintas source: nomor TERTINGGI menang; nomor sama →
    // Shinigami menang via urutan SOURCE_PRIORITY. URL chapter Shinigami
    // ditulis ulang memakai displaySlug agar route /baca tetap valid.
    let latestCh = getCard("latestChapter");
    // Source penyedia latest (untuk badge di tombol Terbaru).
    let latestSrc: ComicSourceId | undefined;
    for (const s of SOURCE_PRIORITY) {
      if (latestCh && g.cards[s]?.latestChapter?.url === latestCh.url) {
        latestSrc = s;
        break;
      }
    }
    {
      let best = chapterNum(latestCh?.label);
      if (Number.isFinite(best)) {
        for (const s of SOURCE_PRIORITY) {
          const cand = g.cards[s]?.latestChapter;
          const n = chapterNum(cand?.label);
          // strictly lebih besar → ganti; sama → pertahankan (Shinigami lebih dulu).
          if (cand && Number.isFinite(n) && n > best) {
            best = n;
            latestCh = cand;
            latestSrc = s;
          }
        }
      }
    }
    // Waktu kartu = sumber PRIORITAS TERTINGGI yang SUDAH punya chapter
    // terbaru (nomor tertinggi lintas source):
    //  - Komiku muncul duluan, Shinigami/Komikcast belum → waktu Komiku.
    //  - Begitu Shinigami ikut punya chapter itu → ganti ke waktu Shinigami.
    //  - Komikcast hanya dipakai bila Shinigami & Komiku belum punya.
    // Urutan prioritas: shinigami → komiku → komikcast. Berlaku untuk semua
    // komik. Badge `latestSource` tetap mengikuti source chapter.
    let mergedUpdatedAt: string | undefined;
    let mergedUpdatedAtTs: number | undefined;
    {
      const now = Date.now();
      let topNum = NaN;
      for (const s of SOURCE_PRIORITY) {
        const n = chapterNum(g.cards[s]?.latestChapter?.label);
        if (Number.isFinite(n) && !(n <= topNum)) topNum = n;
      }
      // "Sudah punya" = nomor chapter terbarunya >= nomor tertinggi. Bila
      // nomor tak terparse di mana pun, semua source dianggap sudah punya.
      const hasTop = (s: ComicSourceId): boolean => {
        if (!Number.isFinite(topNum)) return true;
        const n = chapterNum(g.cards[s]?.latestChapter?.label);
        return Number.isFinite(n) && n >= topNum;
      };
      const pick =
        SOURCE_PRIORITY.find((s) => g.cards[s]?.updatedAt && hasTop(s)) ??
        SOURCE_PRIORITY.find((s) => g.cards[s]?.updatedAt);
      if (pick) {
        mergedUpdatedAt = g.cards[pick]!.updatedAt;
        mergedUpdatedAtTs = g.cards[pick]!.updatedAtTs;
        // Badge sumber ikut sumber waktu: sumber prioritas tertinggi yang
        // sudah punya chapter terbaru. Komiku muncul dulu → badge KOMIKU;
        // Shinigami menyusul → otomatis jadi SHINIGAMI.
        if (hasTop(pick)) latestSrc = pick;
      }
      // Jaminan timestamp absolut — label tidak boleh membeku di teks scrape.
      if (mergedUpdatedAt && typeof mergedUpdatedAtTs !== "number") {
        const m = updatedAtMinutes(mergedUpdatedAt);
        if (Number.isFinite(m)) mergedUpdatedAtTs = now - m * 60_000;
      }
    }
    // Sampul: sumber prioritas tertinggi yang benar-benar punya sampul (URL
    // sudah lewat proxiedImage di adapter), sisanya jadi rantai cadangan.
    const thumbPrimary = ((getCard("thumbnail") as string) || thumbCandidates[0] || "").trim();
    out.push({
      slug: displaySlug,
      title: g.pin?.title ?? (getCard("title") as string) ?? p.title,
      thumbnail: thumbPrimary,
      ...(thumbCandidates.length > 1 ? { thumbnailCandidates: thumbCandidates } : {}),
      ...(getCard("altTitle") ? { altTitle: getCard("altTitle") as string } : {}),
      ...(mergedType ? { type: mergedType } : {}),
      ...(typePick ? { typeSource: typePick.source } : {}),
      ...(genreName ? { genre: genreName } : {}),
      ...(genrePick ? { genreSource: genrePick.source } : {}),
      ...(mergedUpdatedAt ? { updatedAt: mergedUpdatedAt } : {}),
      ...(typeof mergedUpdatedAtTs === "number" ? { updatedAtTs: mergedUpdatedAtTs } : {}),
      ...(synopsisText ? { synopsis: synopsisText } : {}),
      ...(firstCh ? { firstChapter: rewriteShiniUrl(firstCh, displaySlug) } : {}),
      ...(latestCh ? { latestChapter: rewriteShiniUrl(latestCh, displaySlug) } : {}),
      ...(latestSrc ? { latestSource: latestSrc } : {}),
      ...(getCard("views") ? { views: getCard("views") as string } : {}),
      ...(getCard("rank") !== undefined ? { rank: getCard("rank") as number } : {}),
      sources: present,
      sourceSlug: slugs,
    });
  }
  return out;
}

/**
 * URL chapter Shinigami memakai UUID (`/<manga_id>-chapter-N/`); bila kartu
 * gabungan memakai slug Komiku sebagai slug tampilan, tulis ulang prefixnya
 * agar chapterPathToRoute menghasilkan /baca/<slug-tampilan>/<N>.
 * URL Komiku (native path) dibiarkan apa adanya.
 */
export function rewriteShiniUrl<T extends ChapterRef>(ref: T, displaySlug: string): T {
  const m = ref.url.match(/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-chapter-(.+?)\/?$/i);
  if (!m) return ref;
  return { ...ref, url: `/${displaySlug}-chapter-${m[1]}/` };
}

/* ------------------------------------------------------------------ */
/* Urut terbaru lintas source                                             */
/* ------------------------------------------------------------------ */

/**
 * Titik waktu absolut yang STABIL antar-scrape.
 *
 * Sumber hanya memberi teks relatif ("9 menit lalu"). Menghitung
 * `Date.now() - menit` di TIAP scrape membuat waktu "dijangkar ulang" ke
 * sekarang: kalau teks sumber basi (cache HTTP/CDN) atau daftar diganti
 * ulang oleh auto-refresh, label tertahan di "9 menit lalu" selamanya.
 *
 * Di sini perkiraan pertama disimpan per kunci (slug + chapter terbaru) dan
 * perkiraan berikutnya hanya boleh MEMUNDURKAN waktu (lebih tua) — tidak
 * pernah memajukannya. Kunci berganti (chapter baru) → mulai dari awal.
 */
const tsAnchors = new Map<string, number>();
export function anchorTs(key: string, agoMinutes: number, extraAgeMs = 0): number | undefined {
  if (!Number.isFinite(agoMinutes)) return undefined;
  const est = Date.now() - extraAgeMs - agoMinutes * 60_000;
  const prev = tsAnchors.get(key);
  // Normalnya hanya boleh memundurkan (teks relatif yang basi tidak boleh
  // "maju"). Pengecualian: koreksi sumber yang membuat perkiraan >10 menit
  // LEBIH BARU dari jangkar diterima, agar waktu tidak tertahan selamanya
  // di masa lalu saat upstream memperbaiki datanya.
  const next =
    prev === undefined
      ? est
      : est > prev + 10 * 60_000
        ? est
        : Math.min(prev, est);
  tsAnchors.delete(key);
  tsAnchors.set(key, next);
  if (tsAnchors.size > 2000) {
    const oldest = tsAnchors.keys().next().value;
    if (oldest !== undefined) tsAnchors.delete(oldest);
  }
  return next;
}

/**
 * "3 menit lalu" / "2 jam lalu" / "1 hari lalu" (ID & EN) → menit.
 * Tanpa waktu terparse → Infinity (paling belakang, tapi tetap tampil).
 */
export function updatedAtMinutes(raw?: string): number {
  if (!raw) return Infinity;
  const t = raw.toLowerCase().trim();
  // "baru saja" / "just now" = paling baru (tanpa angka).
  if (/^(baru saja|just now)$/.test(t)) return 0;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:yang\s+)?(detik|second|menit|minute|jam|hour|hari|day|minggu|week|bulan|month|tahun|year)/);
  if (!m) return Infinity;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return Infinity;
  const unit = m[2];
  const per =
    unit.startsWith("detik") || unit.startsWith("second") ? 1 / 60
    : unit.startsWith("menit") || unit.startsWith("minute") ? 1
    : unit.startsWith("jam") || unit.startsWith("hour") ? 60
    : unit.startsWith("hari") || unit.startsWith("day") ? 1440
    : unit.startsWith("minggu") || unit.startsWith("week") ? 10080
    : unit.startsWith("bulan") || unit.startsWith("month") ? 43200
    : 525600; // tahun
  return n * per;
}

/**
 * Urutkan kartu gabungan PALING BARU dulu lintas source — BUKAN urutan
 * source. Stabil: waktu sama → urutan asal dipertahankan.
 */
export function sortByFresh<T extends Pick<MangaCard, "updatedAt" | "updatedAtTs">>(cards: T[]): T[] {
  const now = Date.now();
  // Timestamp absolut menang (presisi detik — beberapa kartu sering berbagi
  // label menit yang sama, dan urutan mentah source bisa menaruh komik baru
  // di luar 15 kartu yang tampil). Label relatif jadi cadangan.
  const ageMinutes = (c: T): number => {
    const ts = c.updatedAtTs;
    if (typeof ts === "number" && Number.isFinite(ts)) return Math.max(0, (now - ts) / 60_000);
    return updatedAtMinutes(c.updatedAt);
  };
  return cards
    .map((c, i) => ({ c, i, age: ageMinutes(c) }))
    .sort((a, b) => a.age - b.age || a.i - b.i)
    .map(({ c }) => c);
}

/** Basis sufiks chapter tambahan. "88-10" harus BERBEDA dari "88-1",
 *  jadi tidak boleh diwakili desimal (0.1 == 0.10). */
const CHAPTER_SUB_BASE = 1000;

/**
 * Nomor chapter ordinal dari label: "Chapter 23" → 23000, "88-1" → 88001,
 * "88-10" → 88010, "11.5" → 11005.
 *
 * Bukan angka desimal: sufiks "-10" dulu terbaca 88.1 (sama dengan "-1"),
 * sehingga urutan chapter salah dan pencarian chapter bisa memuat chapter
 * yang salah. Nilai ini HANYA untuk urutan/pencocokan — jangan ditampilkan.
 * NaN bila tak terparse.
 */
export function chapterNum(label?: string): number {
  if (!label) return NaN;
  const k = normalizeChapterKey(label);
  const m = k.match(/^(\d+)(?:[.-](\d+))?$/);
  if (m) {
    const main = Number(m[1]);
    const sub = m[2] ? Math.min(Number(m[2]), CHAPTER_SUB_BASE - 1) : 0;
    return main * CHAPTER_SUB_BASE + sub;
  }
  const n = parseFloat(k);
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------------------------------------------ */
/* Merge detail + chapter                                               */
/* ------------------------------------------------------------------ */

/**
 * Gabungkan detail dari beberapa source. Field teks = Shinigami bila ada,
 * fallback Komiku bila kosong. Genres = gabungan unik per slug/nama.
 * Chapters digabung per nomor chapter ternormalisasi (lihat mergeChapters).
 * Slug tampilan = slug Komiku bila ada, else ID Shinigami.
 */
export function mergeDetails(details: Partial<Record<ComicSourceId, MangaDetail>>): MergedMangaDetail | null {
  const present = SOURCE_PRIORITY.filter((s) => details[s]);
  if (present.length === 0) return null;
  const primary = details[present[0]]!;

  const slugs: Partial<Record<ComicSourceId, string>> = {};
  for (const s of present) slugs[s] = details[s]!.slug;
  const displaySlug = details.komiku?.slug ?? details.komikcast?.slug ?? primary.slug;

  const get = <K extends keyof MangaDetail>(k: K): MangaDetail[K] | undefined => {
    for (const s of SOURCE_PRIORITY) {
      const v = details[s]?.[k];
      if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
    }
    return undefined;
  };

  // Genre = daftar genre dari SATU sumber pemenang (prioritas tertinggi yang
  // punya genre valid) dengan URUTAN ASLINYA — bukan gabungan lintas sumber,
  // bukan alfabetis. Label utama = genres[0] sumber pemenang; Tema (field
  // `theme`) tidak pernah ikut. Aturan yang SAMA dipakai mergeCards dan
  // getMangaSummary (pickPrimaryGenre).
  const genrePick = pickPrimaryGenre(details);
  const genres: GenreRef[] = extendGenreList(details, genrePick);
  const mergedTitle = fixTitle((get("title") as string) ?? primary.title);
  // Tipe: sumber prioritas tertinggi yang punya tipe valid (pickType) —
  // aturan yang sama dengan mergeCards dan getMangaSummary.
  const typeValue: string | undefined = pickType(details)?.type;

  // Kandidat cover lintas sumber (prioritas dulu) untuk fallback onError.
  const covers: string[] = [];
  for (const s of SOURCE_PRIORITY) {
    const c = details[s]?.cover;
    if (c && !covers.includes(c)) covers.push(c);
    // Kandidat per-sumber (portrait/landscape, host alternatif) ikut masuk
    // rantai fallback â€” tanpa ini detail hanya punya satu URL per sumber.
    for (const v of details[s]?.coverCandidates ?? []) {
      if (v && !covers.includes(v)) covers.push(v);
    }
  }
  // Cover utama = sumber prioritas tertinggi yang PUNYA cover. Bila field
  // `cover` semua sumber kosong, kandidat pertama tetap dipakai (dulu hasil
  // akhirnya string kosong = "Cover tidak tersedia" permanen di riwayat).
  const coverPrimary = ((get("cover") as string) || covers[0] || primary.cover || "").trim();
  if (coverPrimary && !covers.includes(coverPrimary)) covers.unshift(coverPrimary);

  // Sinopsis: kualitas terbaik dari SEMUA sumber (placeholder upstream
  // diabaikan, sinopsis rusak/terpotong kalah dari yang utuh).
  const synopsisText =
    pickBestSynopsis(SOURCE_PRIORITY.map((s) => details[s]?.synopsis)) ?? "";
  // Tema: field terpisah dari Genre, tetap kanonis Bahasa Inggris.
  const themeText = themeDisplayName(get("theme") as string | undefined);
  // Rating: pisahkan skor dari batas usia. Skor diambil dari sumber
  // prioritas tertinggi yang benar-benar memberi SKOR ("17+" bukan skor).
  let ratingScore: string | undefined;
  let ageLimit: string | undefined;
  for (const s of SOURCE_PRIORITY) {
    const r = splitRating(details[s]?.rating);
    if (!ratingScore && r.score) ratingScore = r.score;
    if (!ageLimit && r.ageLimit) ageLimit = r.ageLimit;
    if (ratingScore && ageLimit) break;
  }

  const chapters = mergeChapters(
    Object.fromEntries(present.map((s) => [s, details[s]!.chapters])) as Partial<Record<ComicSourceId, ChapterItem[]>>,
    displaySlug,
  );

  let firstCh: ChapterRef | undefined = details.komiku?.firstChapter ?? get("firstChapter");
  {
    const n = chapterNum(firstCh?.label);
    const kcFirst = details.komikcast?.firstChapter;
    const fromKcGuess =
      !!firstCh && !!kcFirst && firstCh.url === kcFirst.url && Number.isFinite(n) && (n as number) > 1;
    const fullSlug = details.komiku?.slug ?? details.shinigami?.slug;
    if (fromKcGuess && fullSlug) {
      firstCh = { label: "Chapter 1", url: `/${fullSlug}-chapter-1/` };
    }
  }
  // latestChapter lintas source: nomor TERTINGGI menang; seri → prioritas.
  const latestCh: ChapterRef | undefined = pickLatest({
    shinigami: details.shinigami?.latestChapter,
    komiku: details.komiku?.latestChapter,
    komikcast: details.komikcast?.latestChapter,
  })?.ref;

  return {
    slug: displaySlug,
    title: mergedTitle,
    ...(get("altTitle") ? { altTitle: fixTitle(get("altTitle") as string) } : {}),
    cover: coverPrimary,
    ...(covers.length > 1 ? { coverCandidates: covers } : {}),
    synopsis: synopsisText,
    ...(typeValue ? { type: typeValue } : {}),
    ...(themeText ? { theme: themeText } : {}),
    genres,
    ...(get("author") ? { author: get("author") as string } : {}),
    ...(get("status") ? { status: get("status") as string } : {}),
    ...(ratingScore ? { rating: ratingScore } : {}),
    ...(ageLimit ? { ageLimit } : {}),
    ...(get("readingDirection") ? { readingDirection: get("readingDirection") as string } : {}),
    ...(firstCh ? { firstChapter: rewriteShiniUrl(firstCh, displaySlug) } : {}),
    ...(latestCh ? { latestChapter: rewriteShiniUrl(latestCh, displaySlug) } : {}),
    chapters,
    sources: present,
    sourceSlug: slugs,
  };
}

/**
 * Gabungkan daftar chapter lintas source. Kunci = nomor ternormalisasi
 * ("Chapter 224" Komiku & "Chapter 224" Shinigami → "224").
 * Aturan per chapter (Shinigami selalu menang bila nomor sama):
 * chapter ada di Shinigami → pakai URL Shinigami; hanya nomor yang
 * tidak ada di Shinigami yang memakai URL Komiku (fallback pelengkap).
 * Label tampilan = dari source prioritas. Urutan = nomor chapter tertinggi
 * dulu lintas source. Nomor tak terparse → fallback urutan daftar Shinigami.
 */
export function mergeChapters(
  lists: Partial<Record<ComicSourceId, ChapterItem[]>>,
  displaySlug: string,
): MergedChapterItem[] {
  const byKey = new Map<string, MergedChapterItem>();
  for (const s of SOURCE_PRIORITY) {
    for (const c of lists[s] ?? []) {
      const key = normalizeChapterKey(c.title);
      if (!key) continue;
      const url = s === "shinigami" ? shiniChapterUrl(displaySlug, c.url) : c.url;
      const cid = s === "shinigami" ? c.chapterId : undefined;
      const ex = byKey.get(key);
      if (ex) {
        // Tanggal diisi dari sumber berikutnya bila sumber pemenang tidak
        // punya tanggal untuk chapter ini (dulu hanya tanggal sumber pertama
        // yang dipakai, sehingga chapter tanpa tanggal Shinigami tetap kosong
        // walau Komiku/Komikcast punya).
        if (!ex.date && c.date) ex.date = c.date;
        if (!ex.sources.some((r) => r.source === s)) {
          ex.sources.push({ source: s, url: c.url, ...(cid ? { chapterId: cid } : {}) });
        } else if (cid) {
          // Slot source sudah ada tapi belum bawa chapterId — lengkapi.
          const slot = ex.sources.find((r) => r.source === s)!;
          if (!slot.chapterId) slot.chapterId = cid;
        }
      } else {
        byKey.set(key, {
          title: c.title,
          url,
          ...(c.date ? { date: c.date } : {}),
          sources: [{ source: s, url: c.url, ...(cid ? { chapterId: cid } : {}) }],
        });
      }
    }
  }
  // Urutan lintas source: nomor chapter TERTINGGI dulu. Tie → Shinigami
  // dulu (urutan sources[0]).
  const primaryList = lists[SOURCE_PRIORITY[0]] ?? [];
  const primaryKeys = primaryList.map((c) => normalizeChapterKey(c.title)).filter(Boolean);
  const order = new Map<string, number>();
  primaryKeys.forEach((k, i) => {
    if (!order.has(k)) order.set(k, i);
  });
  // Satu definisi dengan chapterNum (ordinal) — "88-10" ≠ "88-1".
  const numOf = (k: string) => chapterNum(k);
  const sorted = [...byKey.values()].sort((a, b) => {
    const ka = normalizeChapterKey(a.title);
    const kb = normalizeChapterKey(b.title);
    const na = numOf(ka);
    const nb = numOf(kb);
    // Keduanya terparse → nomor tertinggi dulu; tie → Shinigami dulu
    // (urutan sources[0]).
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if ((nb as number) !== (na as number)) return (nb as number) - (na as number);
      const sa = a.sources[0]?.source ?? "";
      const sb = b.sources[0]?.source ?? "";
      if (sa !== sb) return SOURCE_PRIORITY.indexOf(sa as never) - SOURCE_PRIORITY.indexOf(sb as never);
      return ka.localeCompare(kb);
    }
    const oa = order.get(ka);
    const ob = order.get(kb);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return ka.localeCompare(kb);
  });
  // Semua tanggal dari sumber ditampilkan apa adanya (tanpa penyembunyian);
  // chapter tanpa tanggal di sumber pemenang diisi dari sumber berikutnya.
  return sorted;
}

/**
 * URL chapter Shinigami selalu ditulis ulang ke displaySlug
 * (`/<uuid>-chapter-N/` → `/<displaySlug>-chapter-N/`) agar route /baca
 * valid. URL non-UUID (sudah displaySlug) dibiarkan.
 */
function shiniChapterUrl(displaySlug: string, url: string): string {
  const m = url.match(/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-chapter-(.+?)\/?$/i);
  if (!m) return url;
  return `/${displaySlug}-chapter-${m[1]}/`;
}

/* ------------------------------------------------------------------ */
/* Parallel fetch dengan partial failure                                */
/* ------------------------------------------------------------------ */

/**
 * Jalankan fetch tiap source paralel; source yang gagal → [] / null +
 * log server, source sukses tetap dipakai. TIDAK pernah throw bila
 * minimal satu source berhasil.
 */
export async function fetchAllSettled<T>(
  jobs: Partial<Record<ComicSourceId, () => Promise<T>>>,
  label: string,
): Promise<{ data: Partial<Record<ComicSourceId, T>>; errors: Partial<Record<ComicSourceId, string>> }> {
  const entries = Object.entries(jobs) as [ComicSourceId, () => Promise<T>][];
  // Promise.allSettled: TIDAK ada "siapa cepat dia menang". Semua sumber
  // diselesaikan dulu (sukses maupun gagal), baru pemenang ditentukan oleh
  // SOURCE_PRIORITY yang tetap di bawah â€” bukan oleh urutan selesainya.
  const results = await Promise.allSettled(entries.map(([, fn]) => fn()));
  const settled = results.map((r, i) => {
    const source = entries[i][0];
    if (r.status === "fulfilled") {
      return { source, value: r.value, err: null as unknown, msg: null as string | null };
    }
    const e: unknown = r.reason;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[aggregator:${label}] source=${source} gagal: ${msg}`);
    return { source, value: null as T | null, err: e, msg };
  });
  const data: Partial<Record<ComicSourceId, T>> = {};
  const errors: Partial<Record<ComicSourceId, string>> = {};
  for (const { source, value, msg } of settled) {
    if (value !== null) data[source] = value;
    else errors[source] = msg ?? "unknown";
  }
  if (Object.keys(data).length === 0) {
    // Semua gagal — lempar error asli source pertama (mis. KomikuError
    // + status HTTP) agar route mengembalikan status yang sama seperti
    // sebelum agregator ada. Fallback bila tidak ada error asli.
    const firstErr = settled.map((s) => s.err).find((e) => e instanceof Error);
    throw (
      firstErr ??
      new Error(
        entries.length > 1
          ? "Semua sumber data gagal dimuat. Coba lagi."
          : (errors[entries[0]?.[0] ?? "komiku"] ?? "Gagal memuat data."),
      )
    );
  }
  return { data, errors };
}
