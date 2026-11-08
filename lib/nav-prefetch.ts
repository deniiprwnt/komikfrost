"use client";

import { prefetchApi } from "./client";

/**
 * Data API yang dipakai tiap tujuan menu utama. Dipanaskan sebelum menu
 * ditekan agar halaman tujuan langsung terisi dari cache — tanpa skeleton
 * besar yang terasa seperti reload halaman.
 */
const NAV_API: Record<string, string[]> = {
  // Beranda memakai DUA endpoint (section "popular"/"recommended" lewat
  // /api/home, section "Terbaru" lewat /api/latest?limit=16). Tanpa limit=16
  // prefetch menu tidak pernah menghangatkan section Terbaru beranda.
  "/": ["/api/home", "/api/latest?page=1&orderby=modified&limit=16"],
  "/terbaru": ["/api/latest?page=1&orderby=modified"],
  "/populer": ["/api/popular?period=harian"],
  "/genre": ["/api/genres"],
};

/** Panaskan data satu tujuan menu (dipanggil saat hover/fokus/sentuh). */
export function warmRoute(href: string): void {
  const apis = NAV_API[href];
  if (!apis) return;
  for (const path of apis) prefetchApi(path);
}

let warmed = false;

function canWarm(): boolean {
  if (typeof window === "undefined" || warmed) return false;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return false;
  return true;
}

/**
 * Panaskan data menu utama di latar belakang — sekali per load. Ini yang
 * membuat tap menu di ponsel (tanpa hover) tetap instan: datanya sudah siap
 * sebelum menu dipilih.
 *
 * Ditunda + berurutan: warm pertama langsung setelah mount akan berebut
 * upstream dengan data halaman yang sedang dibuka (scrape 3 source bisa
 * naik dari ~1,5 dtk ke 6 dtk). Jeda 6 dtk membuat permintaan halaman
 * menang dulu; jarak antar-menu mencegah tiga scrape berat berjalan
 * bersamaan.
 */
// Jeda diturunkan 6000 -> 3000: fetch halaman pembuka biasanya selesai
// <3 dtk pada koneksi wajar, jadi upstream sudah longgar setelah 3 dtk.
// Prefetch menunya sendiri sudah berurutan (WARM_GAP_MS) agar tidak
// membanjiri upstream bersamaan.
const WARM_DELAY_MS = 3000;
const WARM_GAP_MS = 1200;

export function warmPrimaryNav(currentPath: string): void {
  if (!canWarm()) return;
  warmed = true;

  const targets = Object.keys(NAV_API).filter((href) =>
    href === "/" ? currentPath !== "/" : !currentPath.startsWith(href),
  );
  if (targets.length === 0) return;

  const next = (i: number) => {
    if (i >= targets.length) return;
    warmRoute(targets[i]);
    window.setTimeout(() => next(i + 1), WARM_GAP_MS);
  };
  window.setTimeout(() => next(0), WARM_DELAY_MS);
}
