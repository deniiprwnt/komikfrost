"use client";

import { useEffect, useState } from "react";

/**
 * Label waktu relatif yang MENUA SENDIRI.
 *
 * `MangaCard.updatedAt` adalah teks yang dibekukan saat scrape ("3 menit
 * lalu"), jadi tanpa perhitungan ulang ia berhenti di angka 3 selamanya —
 * termasuk saat daftar memang tidak berubah (tidak ada komik baru), karena
 * tidak ada state baru yang memicu render.
 *
 * Tiap komponen pemakai memasang satu timer kecil (30 dtk). Jumlahnya
 * sebanyak kartu yang tampil (belasan), jadi biayanya tetap sepele — dan
 * tidak bergantung pada satu store modul yang bisa kehilangan subscriber
 * saat Next memulihkan halaman dari cache router.
 */

const TICK_MS = 30_000;

/**
 * Waktu sekarang (epoch ms) yang di-update tiap 30 dtk.
 * `null` di server & render pertama klien → komponen memakai label dari
 * server dulu (tidak ada mismatch hidrasi), lalu berganti ke label hidup.
 */
export function useNowTick(): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, TICK_MS);
    // Tab yang lama di background bisa menahan interval; begitu terlihat
    // lagi label langsung disegarkan tanpa menunggu tick berikutnya.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return now;
}

/** "4 menit lalu" dari selisih waktu absolut. */
export function formatAgo(ts: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
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
