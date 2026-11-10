/**
 * lib/api/chapter.ts — service reader chapter (multi-source).
 * SHINIGAMI UTAMA; Komiku fallback kedua, Komikcast fallback ketiga
 * per chapter yang tidak ada di source prioritas lebih tinggi.
 */
import { fetchChapter, KomikuError } from "./komiku";
import { fetchKomikcastChapter } from "./komikcast";
import {
  fetchShiniChapter,
  fetchShiniChapterById,
  isShiniId,
  parseNumToken,
  resolveShiniDetailForSlug,
} from "./shinigami";
import { getMangaDetail } from "./manga";
import { normalizeChapterKey, type ComicSourceId, type MergedMangaDetail } from "./aggregator";
import { createKeyedCache } from "./cache";
import type { ChapterData } from "./types";

/** Chapter tidak berubah setelah terbit — cache 5 menit cukup; klik
 *  Prev/Next berulang tidak perlu menyentuh upstream sama sekali. */
const chapterCache = createKeyedCache<ChapterData>(5 * 60_000, 80);

/**
 * Kunci pencocokan chapter dari token URL ("88-10", "88-10-bahasa-indonesia",
 * "Chapter 88-10") → "88-10". String, bukan angka: token bersufiks kelipatan
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
 * penuh ("<slug>-chapter-18", "chapter-18"). Tanpa ini URL dirakit ganda —
 * "/<slug>-chapter-<slug>-chapter-18-bahasa-indonesia/" → 404 upstream.
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
 * @param source  override manual ("shinigami"/"komiku"); default otomatis
 *                per daftar chapter gabungan (Shinigami bila nomor ada di sana)
 */
export async function getChapter(
  slug: string,
  chapter: string,
  source?: ComicSourceId,
): Promise<ChapterData> {
  const s = slug.replace(/^\/+|\/+$/g, "");
  const c = chapter.replace(/^\/+|\/+$/g, "");
  return chapterCache.load(`${s}/${c}/${source ?? "auto"}`, () =>
    loadChapter(s, c, source),
  );
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
  // di detail vs "shita" di chapter) → resolve via daftar gabungan dulu,
  // fallback rakit URL hanya bila daftar tidak punya entri Komikcast.
  if (source === "komikcast") {
    try {
      return await getChapterMerged(s, c, "komikcast");
    } catch {
      // Token dari riwayat/URL bisa sudah membawa slug chapter penuh —
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

  // Slug UUID murni → langsung Shinigami (tanpa Komiku).
  if (isShiniId(s)) {
    if (!Number.isFinite(num)) throw new KomikuError("Nomor chapter tidak valid.", s);
    return fetchShiniChapter(s, num, s, "");
  }

  return getChapterMerged(s, c);
}

/**
 * Jalur gabungan: daftar chapter merge → source per nomor chapter →
 * fetch sisi pemenang → prev/next ditulis ulang dari daftar gabungan
 * (navigasi lintas source) → gagal → coba sisi lain bila tersedia.
 */
async function getChapterMerged(
  slug: string,
  token: string,
  prefer?: ComicSourceId,
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
  const komikuUrl =
    entrySources.find((r) => r.source === "komiku")?.url ??
    `/${slug}-chapter-${bareChapterToken(token)}/`;
  const komikcastUrl =
    entrySources.find((r) => r.source === "komikcast")?.url ??
    `/${slug}-chapter-${bareChapterToken(token)}-bahasa-indonesia/`;

  // Urutan coba: prefer → pemenang merge → sisi lain (prioritas turun).
  const entryHas = (s: ComicSourceId) => entrySources.some((r) => r.source === s);
  const order: ComicSourceId[] = [];
  if (prefer) order.push(prefer);
  if (entrySources.length > 0) {
    const winner: ComicSourceId = hasShini
      ? "shinigami"
      : entryHas("komiku")
        ? "komiku"
        : "komikcast";
    if (!order.includes(winner)) order.push(winner);
    for (const s of ["shinigami", "komiku", "komikcast"] as ComicSourceId[]) {
      if (order.includes(s)) continue;
      // Shinigami boleh dicoba via nomor walau tidak ada di daftar (ID UUID).
      if (entryHas(s) || (s === "shinigami" && shinigamiId)) order.push(s);
    }
  } else {
    // Chapter belum ada di daftar gabungan (mis. baru terbit) -> coba semua.
    for (const s of ["shinigami", "komiku", "komikcast"] as ComicSourceId[]) {
      if (!order.includes(s)) order.push(s);
    }
  }

  let lastErr: unknown = null;
  for (const src of order) {
    try {
      // chapter_id sudah dibawa daftar gabungan → langsung chapter/detail,
      // TANPA chapter-list kedua. Absen (tak terduga) → cari via nomor.
      const shiniChapterId = entrySources.find((r) => r.source === "shinigami")?.chapterId;
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
      return withMergedNav(data, merged, token);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gagal memuat chapter.");
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
