/**
 * lib/api/chapter-fallback.ts - orkestrator fallback chapter (murni, tanpa jaringan).
 *
 * Mencoba sumber SECARA BERURUTAN dan berhenti di sumber pertama yang
 * mengembalikan chapter valid (ada gambar). Sumber berikutnya TIDAK dipanggil
 * bila sumber sebelumnya sudah berhasil. Gagal / kosong = lanjut ke berikutnya.
 */
import type { ChapterData } from "./types";
import type { ComicSourceId } from "./aggregator";

export interface ChapterAttempt {
  source: ComicSourceId;
  run: () => Promise<ChapterData>;
}

export interface ChapterFallbackResult {
  data: ChapterData;
  source: ComicSourceId;
  /** Sumber yang dicoba, berurutan (termasuk yang berhasil). */
  tried: ComicSourceId[];
  /** Jumlah sumber yang gagal sebelum berhasil. */
  fallbacks: number;
}

export async function runChapterFallback(
  attempts: ChapterAttempt[],
  priorError?: unknown,
): Promise<ChapterFallbackResult> {
  const tried: ComicSourceId[] = [];
  let lastErr: unknown = priorError ?? null;
  for (const a of attempts) {
    tried.push(a.source);
    try {
      const data = await a.run();
      if (data && Array.isArray(data.images) && data.images.length > 0) {
        return { data, source: a.source, tried, fallbacks: tried.length - 1 };
      }
      lastErr = new Error(`Chapter kosong dari ${a.source}.`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gagal memuat chapter.");
}
