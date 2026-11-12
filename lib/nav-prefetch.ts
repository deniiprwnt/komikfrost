"use client";

import { prefetchApi } from "./client";

/**
 * Data API yang dipakai tiap tujuan menu utama. Dipanaskan sebelum menu
 * ditekan agar halaman tujuan langsung terisi dari cache â€” tanpa skeleton
 * besar yang terasa seperti reload.
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

/**
 * Panaskan data satu tujuan menu. HANYA dipanggil saat user menunjukkan
 * niat membuka menu (hover, fokus keyboard, sentuh, atau pointerdown) â€”
 * lihat components/nav-link.tsx.
 */
export function warmRoute(href: string): void {
  const apis = NAV_API[href];
  if (!apis) return;
  for (const path of apis) prefetchApi(path);
}

// Prefetch OTOMATIS (warmPrimaryNav: memanaskan SEMUA menu di latar belakang
// beberapa detik setelah mount) DIHAPUS.
//
// Alasan: tiap pemanggilan memicu scrape 3 sumber. Satu load halaman jadi
// menembak upstream untuk halaman yang belum tentu pernah dibuka â€” biaya
// function invocation + bandwidth tanpa manfaat, dan bisa membuat request
// halaman yang SEDANG dibuka kalah cepat.
//
// Yang DIPERTAHANKAN: warmRoute di atas, yang hanya jalan ketika user
// benar-benar menunjukkan niat membuka menu lewat components/nav-link.tsx.
// Handler hover/fokus/sentuh di sana tidak berubah.
