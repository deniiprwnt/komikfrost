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
 * Tiap komponen pemakai memasang satu timer kecil (1 dtk). Jumlahnya
 * sebanyak kartu yang tampil (belasan) sehingga masih ringan — dan tidak
 * bergantung pada satu store modul yang bisa kehilangan subscriber saat
 * Next memulihkan halaman dari cache router.
 */

const TICK_MS = 1_000;

/**
 * Waktu sekarang (epoch ms) yang di-update tiap 1 dtk.
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

/** "3 menit lalu" dari selisih waktu absolut — hanya SATU satuan
 *  (satuan terbesar) agar label ringkas. Detik tetap ditampilkan selama
 *  di bawah 1 menit, jadi label masih berdetak tiap tick 1 dtk. */
export function formatAgo(ts: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  if (secs < 1) return "baru saja";
  if (secs < 60) return `${secs} detik lalu`;
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
export function cardSig(i: { slug: string; latestChapter?: { url?: string }; updatedAtTs?: number }): string {
  return `${i.slug}#${i.latestChapter?.url ?? ""}#${ageTier(i.updatedAtTs)}`;
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
