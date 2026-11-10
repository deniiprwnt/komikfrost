"use client";

import { useEffect, useRef } from "react";
import { apiGet, invalidateApi } from "@/lib/client";
import { DATA_VERSION } from "@/lib/api/cache";
import { saveHistory, useHistory } from "@/lib/history";
import type { MangaDetail } from "@/lib/api/types";

/**
 * Invalidasi cache DATA LAMA di sisi klien + pemulihan sampul riwayat.
 *
 * 1. Saat DATA_VERSION server naik, semua snapshot localStorage yang dibuat
 *    versi lama (genre Bahasa Indonesia, sinopsis mentah, sampul placeholder)
 *    dibuang dan cache memori klien dikosongkan. Sekali per versi.
 * 2. Entri riwayat yang tersimpan TANPA sampul (dulu terjadi bila chapter
 *    dibuka langsung sehingga cache detail kosong â€” kasus Limit Breaker di
 *    "Lanjut membaca"/Riwayat) diisi ulang dari detail gabungan, sehingga
 *    jalur sampulnya sama dengan halaman detail.
 *
 * Tidak merender apa pun; dipasang sekali di layout.
 */

const VERSION_KEY = "kf.data-version";
const SNAP_PREFIX = "kf.snap:";

function wipeClientCaches(): void {
  try {
    if (window.localStorage.getItem(VERSION_KEY) === DATA_VERSION) return;
  } catch {
    // storage diblokir â€” cache memori tetap perlu dibersihkan
  }
  invalidateApi();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(SNAP_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
    window.localStorage.setItem(VERSION_KEY, DATA_VERSION);
  } catch {
    // kuota/mode privat â€” cache memori sudah dikosongkan
  }
}

export function ClientDataVersion() {
  const { entries } = useHistory();
  const started = useRef(false);

  useEffect(() => {
    wipeClientCaches();
  }, []);

  // Isi ulang sampul riwayat yang kosong (maks 5 sekali per pemuatan,
  // konkurensi 2 agar ramah rate limit). Data yang sudah ada tidak disentuh.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // SELALU selaraskan sampul riwayat dengan record kanonis (bukan hanya
    // entri tanpa sampul). Dulu entri dengan sampul placeholder/lokal yang
    // usang (mis. Limit Breaker) tidak pernah diperbaiki sehingga "Lanjut
    // membaca" dan Riwayat tetap menampilkan kotak kosong walau halaman
    // detail punya sampulnya.
    const needy = entries.slice(0, 12);
    if (needy.length === 0) return;
    let cancelled = false;
    const queue = [...needy];
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !cancelled) {
        const e = queue.shift();
        if (!e) break;
        try {
          // Detail GABUNGAN (bukan ?ringkas=1): sampul yang dipakai adalah
          // sampul record kanonis â€” jalur yang sama dengan halaman detail.
          const d = await apiGet<MangaDetail>(`/api/manga/${encodeURIComponent(e.slug)}`);
          if (cancelled || !d.cover) continue;
          if (e.cover === d.cover) continue;
          saveHistory({
            slug: e.slug,
            title: e.title,
            cover: d.cover,
            chapter: e.chapter,
            chapterLabel: e.chapterLabel,
            route: e.route,
            progress: e.progress,
            ...(typeof e.page === "number" ? { page: e.page } : {}),
          });
        } catch {
          // Gagal satu judul â€” biarkan; percobaan berikutnya saat dibuka lagi.
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [entries]);

  return null;
}
