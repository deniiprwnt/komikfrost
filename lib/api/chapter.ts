/**
 * lib/api/chapter.ts - service reader chapter (multi-source).
 * Urutan prioritas: komiku (Mahwaindo) -> shinigami (Kiryuu) -> komikcast.
 * Sumber dicoba BERURUTAN dan berhenti di yang pertama berhasil.
 */
import { KomikuError } from "./komiku";
import { fetchChapter } from "./manhwaindo";
import { fetchKomikcastChapter } from "./komikcast";
// Slot "shinigami" di kode mengarah ke Kiryuu - semua fungsi `fetchShini*`
// di lib/api/shinigami.ts adalah shim tipis ke lib/api/kiryuu.ts. Nama source
// di SOURCE_PRIORITY & field sourceSlug tetap "shinigami" agar tidak perlu
// refactor besar di seluruh pemanggil.
import {
  fetchShiniChapter,
  fetchShiniChapterById,
  isShiniId,
  parseNumToken,
  resolveShiniDetailForSlug,
} from "./shinigami";
import { getMangaDetail, peekMangaDetail } from "./manga";
import { normalizeChapterKey, type ComicSourceId, type MergedMangaDetail } from "./aggregator";
import { createKeyedCache } from "./cache";
import { runChapterFallback, type ChapterAttempt } from "./chapter-fallback";
import { count, timed } from "./metrics.ts";
import type { ChapterData } from "./types";

/** Chapter tidak berubah setelah terbit - cache 5 menit cukup; klik
 *  Prev/Next berulang tidak perlu menyentuh upstream sama sekali. */
const chapterCache = createKeyedCache<ChapterData>(5 * 60_000, 80, { name: "chapter" });

/**
 * Kunci pencocokan chapter dari token URL ("88-10", "88-10-bahasa-indonesia",
 * "Chapter 88-10") -> "88-10". String, bukan angka: token bersufiks kelipatan
 * sepuluh ("-10") dulu bertabrakan dengan "-1" saat diubah ke desimal.
 */
function tokenChapterKey(tok: string): string {
  return normalizeChapterKey(bareChapterToken(tok))
    .replace(/^[.-]+/, "")
    // "88.5" dan "88-5" adalah chapter yang sama (token URL memakai "-").
    .replace(/(\d)[.](\d)/g, "$1-$2");
}

/**
 * Token "bersih" untuk merakit URL sumber: buang sufiks "-bahasa-indonesia"
 * dan prefiks slug/chapter yang terbawa bila token ternyata slug chapter
 * penuh ("<slug>-chapter-18", "chapter-18"). Tanpa ini URL dirakit ganda -
 * "/<slug>-chapter-<slug>-chapter-18-bahasa-indonesia/" -> 404 upstream.
 */
function bareChapterToken(tok: string): string {
  const out = tok
    .replace(/-bahasa-indonesia$/i, "")
    .replace(/^(?:.*-)?chapter-/i, "");
  return out || tok;
}

/**
 * Ambil satu chapter.
 * @param slug    slug Komiku ("blue-lock") atau UUID Shinigami
 * @param chapter nomor chapter, mis. "360" atau "11-2" untuk 11.2
 * @param source  override manual; default otomatis (sequential fallback)
 */
export async function getChapter(
  slug: string,
  chapter: string,
  source?: ComicSourceId,
): Promise<ChapterData> {
  const s = slug.replace(/^\/+|\/+$/g, "");
  const c = chapter.replace(/^\/+|\/+$/g, "");
  return chapterCache.load(`${s}/${c}/${source ?? "auto"}`, () =>
    timed("chapter", { source: source ?? "auto" }, () => loadChapter(s, c, source)),
  );
}

/**
 * Jalur otomatis. Data chapter (gambar) dipisah dari metadata navigasi:
 *  - detail gabungan sudah di cache -> jalur gabungan (prev/next lintas
 *    sumber utuh, tanpa scrape tambahan);
 *  - belum ada -> coba Mahwaindo langsung (1 request, tanpa scrape tiga
 *    sumber); prev/next memakai navigasi sumber itu sendiri. Gagal/kosong ->
 *    jalur gabungan. Mahwaindo dilewati di sana HANYA bila URL dari daftar
 *    chapter (entrySources) sama dengan URL tebakan yang sudah dicoba; bila
 *    beda atau belum diketahui, Mahwaindo tetap dicoba dengan URL yang benar.
 */
async function getChapterAuto(s: string, c: string): Promise<ChapterData> {
  if (peekMangaDetail(s)) return getChapterMerged(s, c);
  const guessedUrl = `/${s}-chapter-${bareChapterToken(c)}/`;
  const attempts: ChapterAttempt[] = [
    {
      source: "komiku",
      run: async () => ({
        ...(await fetchChapter(guessedUrl, { nav: false })),
        source: "komiku" as ComicSourceId,
      }),
    },
  ];
  try {
    const r = await runChapterFallback(attempts);
    count("chapter.fastpath.ok");
    return r.data;
  } catch (e) {
    count("chapter.fastpath.fallback");
    return getChapterMerged(s, c, undefined, [], e, guessedUrl);
  }
}

async function loadChapter(
  s: string,
  c: string,
  source?: ComicSourceId,
): Promise<ChapterData> {
  const num = parseNumToken(bareChapterToken(c));

  // Override eksplisit (dipakai ?source=... saat satu sisi gagal total).
  if (source === "komiku") return fetchChapter(`/${s}-chapter-${bareChapterToken(c)}/`);
  // Komikcast: slug detail bisa beda dari slug chapter (mis. typo "shitaa"
  // di detail vs "shita" di chapter) -> resolve via daftar gabungan dulu,
  // fallback rakit URL hanya bila daftar tidak punya entri Komikcast.
  if (source === "komikcast") {
    try {
      return await getChapterMerged(s, c, "komikcast");
    } catch {
      // Token dari riwayat/URL bisa sudah membawa slug chapter penuh -
      // jangan digandakan ("-bahasa-indonesia-bahasa-indonesia").
      return fetchKomikcastChapter(`/${s}-chapter-${bareChapterToken(c)}-bahasa-indonesia/`);
    }
  }
  if (source === "shinigami") {
    if (isShiniId(s)) {
      if (!Number.isFinite(num)) throw new KomikuError("Nomor chapter tidak valid.", s);
      return fetchShiniChapter(s, num, s, "");
    }
    return getChapterMerged(s, c, "shinigami");
  }

  // Slug UUID murni -> langsung Shinigami (tanpa Komiku).
  if (isShiniId(s)) {
    if (!Number.isFinite(num)) throw new KomikuError("Nomor chapter tidak valid.", s);
    return fetchShiniChapter(s, num, s, "");
  }

  return getChapterAuto(s, c);
}

/**
 * Jalur gabungan: daftar chapter merge -> source per nomor chapter ->
 * fetch sisi pemenang -> prev/next ditulis ulang dari daftar gabungan
 * (navigasi lintas source) -> gagal -> coba sisi lain bila tersedia.
 * `skip` = sumber yang sudah dicoba dan gagal (tidak diulang);
 * `priorError` = error terakhir dari percobaan sebelumnya;
 * `triedKomikuUrl` = URL Mahwaindo yang sudah dicoba jalur cepat. Mahwaindo
 * dilewati hanya bila URL dari entrySources sama dengan URL ini.
 */
async function getChapterMerged(
  slug: string,
  token: string,
  prefer?: ComicSourceId,
  skip: ComicSourceId[] = [],
  priorError?: unknown,
  triedKomikuUrl?: string,
): Promise<ChapterData> {
  const merged = (await getMangaDetail(slug, { deep: false })) as MergedMangaDetail;
  const shinigamiId = merged.sourceSlug?.shinigami;
  // Pencocokan per kunci string (bukan selisih angka): "88-10" tidak boleh
  // cocok dengan "88-1".
  const key = tokenChapterKey(token);
  // Angka desimal tetap dipakai HANYA untuk API Shinigami (chapter_number float).
  const num = parseNumToken(bareChapterToken(token));
  const item = key ? merged.chapters.find((ch) => tokenChapterKey(ch.title) === key) : undefined;
  const entrySources = item?.sources ?? [];
  const hasShini = shinigamiId && entrySources.some((r) => r.source === "shinigami");
  const listedKomikuUrl = entrySources.find((r) => r.source === "komiku")?.url;
  const komikuUrl = listedKomikuUrl ?? `/${slug}-chapter-${bareChapterToken(token)}/`;
  // Skip Mahwaindo hanya bila URL resmi dari daftar terbukti sama dengan yang
  // sudah gagal di jalur cepat. Beda/belum diketahui -> tetap dicoba.
  const komikuAlreadyTried =
    !!triedKomikuUrl && !!listedKomikuUrl && sameChapterUrl(listedKomikuUrl, triedKomikuUrl);
  const effectiveSkip: ComicSourceId[] = komikuAlreadyTried ? [...skip, "komiku"] : skip;
  const komikcastUrl =
    entrySources.find((r) => r.source === "komikcast")?.url ??
    `/${slug}-chapter-${bareChapterToken(token)}-bahasa-indonesia/`;

  // Urutan coba: prefer -> pemenang merge -> sisi lain (prioritas turun).
  const entryHas = (s: ComicSourceId) => entrySources.some((r) => r.source === s);
  const order: ComicSourceId[] = [];
  if (prefer) order.push(prefer);
  if (entrySources.length > 0) {
    const winner: ComicSourceId = entryHas("komiku")
      ? "komiku"
      : hasShini
        ? "shinigami"
        : "komikcast";
    if (!order.includes(winner)) order.push(winner);
    for (const s of ["komiku", "shinigami", "komikcast"] as ComicSourceId[]) {
      if (order.includes(s)) continue;
      // Shinigami boleh dicoba via nomor walau tidak ada di daftar (ID UUID).
      if (entryHas(s) || (s === "shinigami" && shinigamiId)) order.push(s);
    }
  } else {
    // Chapter belum ada di daftar gabungan (mis. baru terbit) -> coba semua.
    for (const s of ["komiku", "shinigami", "komikcast"] as ComicSourceId[]) {
      if (!order.includes(s)) order.push(s);
    }
  }

  // chapter_id sudah dibawa daftar gabungan -> langsung chapter/detail,
  // TANPA chapter-list kedua. Absen (tak terduga) -> cari via nomor.
  const shiniChapterId = entrySources.find((r) => r.source === "shinigami")?.chapterId;
  const attempts: ChapterAttempt[] = order
    .filter((src) => !effectiveSkip.includes(src))
    .map((src) => ({
      source: src,
      run: async () => {
        const data: ChapterData =
          src === "shinigami"
            ? shinigamiId
              ? shiniChapterId
                ? await fetchShiniChapterById(shiniChapterId, merged.slug, merged.title)
                : await fetchShiniChapter(shinigamiId, num, merged.slug, merged.title)
              : await Promise.reject(new KomikuError("Tidak tersedia di Shinigami.", slug))
            : src === "komikcast"
              ? await fetchKomikcastChapter(komikcastUrl)
              : await fetchChapter(komikuUrl, { nav: false });
        return withMergedNav({ ...data, source: src }, merged, token);
      },
    }));
  const r = await runChapterFallback(attempts, priorError);
  count(`chapter.source.${r.source}`);
  if (r.fallbacks > 0) count("chapter.fallbacks", r.fallbacks);
  return r.data;
}

/** Bandingkan dua URL chapter; perbedaan garis miring akhir diabaikan. */
function sameChapterUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * Tulis ulang prev/next dari daftar chapter gabungan (terbaru dulu):
 * idx-1 = lebih baru (next), idx+1 = lebih lama (prev). URL sudah
 * displaySlug-based sehingga navigasi lintas source tetap valid.
 */
function withMergedNav(data: ChapterData, merged: MergedMangaDetail, token: string): ChapterData {
  const key = tokenChapterKey(token);
  if (!key) return data;
  const idx = merged.chapters.findIndex((ch) => tokenChapterKey(ch.title) === key);
  if (idx < 0) return data;
  const next = idx > 0 ? merged.chapters[idx - 1] : undefined;
  const prev = idx + 1 < merged.chapters.length ? merged.chapters[idx + 1] : undefined;
  // Tulis ulang PENUH dari daftar gabungan: prev/next mentah sisi pemenang
  // (mis. prevUrl Komiku = chapter lain saat di chapter terlama) yang tidak
  // ada di daftar harus dibuang, bukan dibiarkan bocor (prev == next).
  const out = { ...data };
  if (prev) out.prevUrl = prev.url;
  else delete out.prevUrl;
  if (next) out.nextUrl = next.url;
  else delete out.nextUrl;
  return out;
}

// Re-export agar route lama yang mengimpor resolve tetap jalan bila perlu.
export { resolveShiniDetailForSlug };
