/**
 * lib/api/cache.ts â€” cache memori per-instance untuk hasil scrape/merge.
 *
 * `force-dynamic` membuat setiap request route menembak ulang upstream
 * (fetch tanpa cache HTTP), padahal membuka reader berurutan memanggil
 * detail komik yang sama berkali-kali. Cache ini hanya menghilangkan KERJA
 * scrape/merge; gate + rate limit tetap jalan di setiap request.
 *
 * - TTL pendek (default 30-60 dtk) agar data terbaru tetap mengalir.
 * - Inflight dedupe: request bersamaan untuk key sama hanya memicu 1 kerja.
 * - Error TIDAK di-cache â€” kegagalan sementara boleh dicoba lagi.
 * - Setiap entri diberi cap DATA_VERSION: menaikkan versi = seluruh cache
 *   memori lama (genre, sinopsis, sampul, daftar chapter) tidak pernah
 *   terbaca lagi, tanpa perlu restart manual.
 */

/**
 * Versi skema data hasil normalisasi. NAIKKAN setiap kali aturan
 * normalisasi/merge berubah (genre kanonis, pembersihan sinopsis, jalur
 * sampul, dedupe judul). Efeknya:
 * - cache memori server (keyed/ttl) tidak lagi memakai entri versi lama;
 * - URL upstream diberi `?_v=<versi>` (lihat withDataVersion) sehingga
 *   cache HTTP Next/CDN tidak menyajikan HTML/JSON mentah versi lama;
 * - klien (components/client-cache-version.tsx) membuang snapshot
 *   localStorage + cache memori saat versi berubah.
 */
export const DATA_VERSION = "norm-2026-11-11d";

/**
 * Tempel versi data ke URL upstream sebagai query `_v`. Sumber mengabaikan
 * parameter tak dikenal, tetapi cache HTTP (Next data cache / CDN) melihat
 * URL baru sehingga data mentah lama tidak dipakai ulang setelah versi naik.
 */
export function withDataVersion(raw: string): string {
  try {
    const u = new URL(raw);
    u.searchParams.set("_v", DATA_VERSION);
    return u.toString();
  } catch {
    return raw;
  }
}

interface Entry<T> {
  at: number;
  /** Versi data saat entri dibuat â€” entri versi lain dianggap tidak ada. */
  v: string;
  data: T;
}

/** Cache satu nilai (satu key), mis. daftar genre. */
export function createTtlCache<T>(ttlMs: number) {
  let entry: Entry<T> | null = null;
  let inflight: Promise<T> | null = null;
  const fresh = (e: Entry<T> | null): e is Entry<T> =>
    !!e && e.v === DATA_VERSION && Date.now() - e.at < ttlMs;
  return {
    get(): T | null {
      return fresh(entry) ? entry.data : null;
    },
    async load(fn: () => Promise<T>): Promise<T> {
      if (fresh(entry)) return entry.data;
      if (!inflight) {
        inflight = fn()
          .then((data) => {
            entry = { at: Date.now(), v: DATA_VERSION, data };
            return data;
          })
          .finally(() => {
            inflight = null;
          });
      }
      return inflight;
    },
  };
}

/** Cache ber-key (mis. per slug / per chapter) dengan batas entri. */
export function createKeyedCache<T>(ttlMs: number, maxEntries = 100) {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();
  // Key selalu ber-versi: entri lama tidak pernah cocok lagi.
  const vkey = (key: string): string => `${DATA_VERSION}:${key}`;
  return {
    /**
     * `keep` (opsional): hasil yang gagal lolos `keep` tetap dikembalikan ke
     * pemanggil tetapi TIDAK disimpan — dipakai untuk hasil parsial (satu
     * sumber gagal sementara) agar tidak "membekukan" data yang kurang
     * lengkap selama TTL penuh.
     */
    async load(key: string, fn: () => Promise<T>, keep?: (data: T) => boolean): Promise<T> {
      const k = vkey(key);
      const hit = entries.get(k);
      if (hit && hit.v === DATA_VERSION && Date.now() - hit.at < ttlMs) return hit.data;
      const pending = inflight.get(k);
      if (pending) return pending;
      const next = fn()
        .then((data) => {
          if (keep && !keep(data)) return data;
          entries.set(k, { at: Date.now(), v: DATA_VERSION, data });
          // Buang entri terlama bila melewati batas (Map = urutan insert).
          if (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) entries.delete(oldest);
          }
          return data;
        })
        .finally(() => {
          if (inflight.get(k) === next) inflight.delete(k);
        });
      inflight.set(k, next);
      return next;
    },
    clear(): void {
      entries.clear();
    },
  };
}
