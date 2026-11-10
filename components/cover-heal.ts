"use client";

import { useSyncExternalStore } from "react";

/**
 * Penyimpanan kecil (tanpa dependensi) yang menghubungkan <CoverImage> dengan
 * pemulih sampul riwayat (client-cache-version.tsx).
 *
 * Kunci:
 * - EMPTY_KEY ("")  → entri riwayat yang tersimpan TANPA sampul; sedang/akan
 *   diisi dari detail gabungan.
 * - URL sampul      → sampul yang gagal dimuat seluruh kandidatnya; pemulih
 *   mencari sampul pengganti dari detail gabungan.
 *
 * Selama kunci belum selesai, CoverImage menampilkan skeleton. Placeholder
 * "Cover tidak tersedia" baru muncul setelah kunci ditandai selesai.
 */

export const EMPTY_KEY = "";

const listeners = new Set<() => void>();
const brokenListeners = new Set<(src: string) => void>();
const pending = new Set<string>();
const settled = new Set<string>();
const requested = new Set<string>();
let version = 0;

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

/** Tandai kunci sedang dipulihkan (skeleton ditampilkan). */
export function markCoverPending(key: string): void {
  if (pending.has(key) && !settled.has(key)) return;
  settled.delete(key);
  pending.add(key);
  emit();
}

/** Tandai pemulihan kunci selesai (berhasil atau semua kandidat gagal). */
export function markCoverSettled(key: string): void {
  pending.delete(key);
  settled.add(key);
  emit();
}

/** Lupakan status kunci agar bisa dipulihkan lagi (mis. sampul sudah diganti). */
export function resetCoverKey(key: string): void {
  requested.delete(key);
  settled.delete(key);
  pending.delete(key);
  emit();
}

/**
 * Dipanggil CoverImage saat SEMUA kandidat sampul gagal. Satu kali per URL
 * per sesi halaman; pemulih (bila terpasang) mencari sampul pengganti.
 */
export function reportBrokenCover(src: string): void {
  if (!src || requested.has(src) || settled.has(src)) return;
  requested.add(src);
  markCoverPending(src);
  // Pengaman: tanpa pemulih terpasang skeleton tidak boleh menggantung.
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (!settled.has(src)) markCoverSettled(src);
    }, 8000);
  }
  for (const l of brokenListeners) l(src);
}

export function onBrokenCover(cb: (src: string) => void): () => void {
  brokenListeners.add(cb);
  return () => {
    brokenListeners.delete(cb);
  };
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getVersion = (): number => version;

/**
 * true selama kunci belum selesai dipulihkan. Untuk EMPTY_KEY, "belum
 * selesai" adalah keadaan awal (sebelum pemulih sempat berjalan) sehingga
 * entri tanpa sampul tidak sempat berkedip sebagai placeholder.
 */
export function useCoverHealing(key: string, enabled: boolean): boolean {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (!enabled) return false;
  // Belum selesai = menunggu laporan/pemulihan; tidak ada kedipan placeholder
  // di antara kegagalan terakhir dan dimulainya pemulihan.
  return !settled.has(key);
}
