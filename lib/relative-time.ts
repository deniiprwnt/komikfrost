"use client";

import { useSyncExternalStore } from "react";

/**
 * Label waktu relatif yang MENUA SENDIRI.
 *
 * `MangaCard.updatedAt` adalah teks yang dibekukan saat scrape ("3 menit
 * lalu"), jadi tanpa perhitungan ulang ia berhenti di angka 3 selamanya —
 * termasuk saat daftar memang tidak berubah (tidak ada komik baru), karena
 * tidak ada state baru yang memicu render.
 *
 * Tiap komponen pemakai memasang satu timer kecil (1 dtk). Jumlahnya
 * sebanyak kartu yang tampil (belasan) sehingga masih ringan — dan tidak
 * bergantung pada satu store modul yang bisa kehilangan subscriber saat
 * Next memulihkan halaman dari cache router.
 */

const TICK_MS = 15_000;

/**
 * Waktu sekarang (epoch ms) yang di-update tiap 1 dtk.
 * `null` di server & render pertama klien → komponen memakai label dari
 * server dulu (tidak ada mismatch hidrasi), lalu berganti ke label hidup.
 */
/*
 * Satu sumber waktu bersama untuk SEMUA kartu. Dulu tiap kartu memasang
 * useState + setInterval sendiri (beranda bisa 40+ timer yang masing-masing
 * memicu render per detik). Sekarang: satu interval modul, satu snapshot,
 * semua pelanggan diberi tahu bersamaan. Timer berhenti saat tidak ada
 * pelanggan dan disegarkan saat tab kembali terlihat.
 */
let nowValue: number | null = null;
let tickTimer = 0;
const tickListeners = new Set<() => void>();

function publishNow(): void {
  nowValue = Date.now();
  for (const cb of tickListeners) cb();
}

function startTicking(): void {
  if (tickTimer || typeof window === "undefined") return;
  publishNow();
  tickTimer = window.setInterval(publishNow, TICK_MS);
  // Tab yang lama di background bisa menahan interval; begitu terlihat
  // lagi label langsung disegarkan tanpa menunggu tick berikutnya.
  document.addEventListener("visibilitychange", onVisibleTick);
}

function stopTicking(): void {
  if (typeof window === "undefined") return;
  window.clearInterval(tickTimer);
  tickTimer = 0;
  // Snapshot basi tidak boleh dipakai pelanggan baru setelah idle panjang.
  nowValue = null;
  document.removeEventListener("visibilitychange", onVisibleTick);
}

function onVisibleTick(): void {
  if (document.visibilityState === "visible") publishNow();
}

function subscribeNow(cb: () => void): () => void {
  tickListeners.add(cb);
  startTicking();
  // Pelanggan baru langsung mendapat nilai terakhir bila sudah ada.
  if (nowValue !== null) cb();
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0) stopTicking();
  };
}

function getNowSnapshot(): number | null {
  return nowValue;
}

function getNowServerSnapshot(): number | null {
  // Server & render hidrasi memakai label dari server (tanpa mismatch).
  return null;
}

export function useNowTick(): number | null {
  return useSyncExternalStore(subscribeNow, getNowSnapshot, getNowServerSnapshot);
}

/** "3 menit lalu" dari selisih waktu absolut — hanya SATU satuan
 *  (satuan terbesar) agar label ringkas. Detik tetap ditampilkan selama
 *  di bawah 1 menit, jadi label masih berdetak tiap tick 1 dtk. */
export function formatAgo(ts: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  // <60 dtk cukup "baru saja": menghindari tick per-detik untuk semua
  // kartu (puluhan re-render/detik di beranda).
  if (secs < 60) return "baru saja";
  const mins = Math.floor(secs / 60);
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

/**
 * Tingkat umur kartu untuk pembanding daftar ("detik" | "menit" | "jam" | ...).
 * Dipakai deteksi perubahan auto-refresh: chapter yang sama tapi waktunya
 * berpindah tingkat (mis. "5 hari lalu" → "31 detik lalu" karena Komiku /
 * Komikcast lebih cepat mengindeks) HARUS dianggap berubah. Hanya satuan yang
 * dibandingkan (bukan angkanya) supaya detak waktu biasa tidak memicu
 * penggantian daftar tiap polling.
 */
export function ageTier(ts?: number, now: number = Date.now()): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  return formatAgo(ts, now).replace(/^\d+\s+/, "").replace(/\s+lalu$/, "");
}

/** Kunci perbandingan satu kartu untuk deteksi perubahan daftar. */
export function cardSig(i: {
  slug: string;
  latestChapter?: { url?: string };
  updatedAtTs?: number;
  latestSource?: string;
}): string {
  // latestSource ikut: sumber berganti (Komiku → Shinigami) harus mengganti
  // badge & waktu walau chapter dan tingkat umurnya sama.
  return `${i.slug}#${i.latestChapter?.url ?? ""}#${ageTier(i.updatedAtTs)}#${i.latestSource ?? ""}`;
}

/**
 * Label waktu satu kartu: hitung ulang dari `updatedAtTs` bila ada,
 * fallback ke teks dari server (`updatedAt`) untuk respons lama.
 */
export function useUpdatedLabel(updatedAt?: string, updatedAtTs?: number): string | undefined {
  const now = useNowTick();
  if (now !== null && typeof updatedAtTs === "number" && Number.isFinite(updatedAtTs)) {
    return formatAgo(updatedAtTs, now);
  }
  return updatedAt;
}
