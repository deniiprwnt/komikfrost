"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markClientHydrated } from "@/lib/client";
import {
  flushScrollStore,
  holdScrollSave,
  markPopNav,
  readScroll,
  resolvePopNav,
  restoreScroll,
  saveScroll,
  urlKey,
} from "@/lib/nav-scroll";

/**
 * Pemulih posisi gulir antar-halaman (dipasang sekali di layout).
 *
 * - Maju/klik menu → mulai dari atas (seperti membuka layar baru).
 * - Kembali/maju browser → posisi gulir layar itu dipulihkan, tanpa menunggu
 *   konten selesai dimuat (retry sampai dokumen cukup tinggi).
 * - `history.scrollRestoration = "manual"` supaya browser tidak "membantu"
 *   memulihkan lebih dulu saat dokumen masih setinggi skeleton.
 * - Muat ulang halaman (refresh / PWA dibuka lagi setelah dibuang OS) juga
 *   memulihkan posisi terakhir.
 */
export function NavMemory() {
  const pathname = usePathname() ?? "";
  const lastKey = useRef("");

  useEffect(() => {
    // Hidrasi dokumen pertama selesai: mulai sekarang snapshot disk boleh
    // dibaca saat render (navigasi dalam aplikasi tidak pernah hidrasi).
    markClientHydrated();
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      // browser kuno — abaikan
    }

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Simpan atas nama halaman yang SEDANG tampil (`lastKey`), bukan URL
        // saat frame ini jalan: klik tautan mengubah URL lebih dulu, sehingga
        // posisi halaman lama bisa tercatat sebagai posisi halaman baru.
        saveScroll(lastKey.current || urlKey(), window.scrollY);
      });
    };
    const onHide = () => flushScrollStore();

    // Didaftarkan sebelum router Next: listener popstate berjalan sinkron,
    // jadi penanda sudah terbaca saat halaman tujuan dirender.
    const onPop = () => {
      // Posisi halaman yang ditinggalkan masih utuh di sini — kunci atas
      // namanya sebelum URL/tinggi dokumen berubah.
      saveScroll(lastKey.current, window.scrollY, true);
      markPopNav();
    };

    // Klik tautan = niat meninggalkan halaman. Posisi dibaca SEBELUM router
    // menggulir ke atas, lalu ditahan sebentar agar gulir itu tidak tercatat
    // sebagai posisi halaman lama (semua jadi 0 dan "kembali" ke atas).
    const onClick = () => {
      // URL dibaca di sini (bukan `lastKey`): halaman daftar menulis filter
      // ke query string tanpa mengganti pathname, jadi kunci terbaru ada di URL.
      const key = urlKey();
      if (!key) return;
      saveScroll(key, window.scrollY, true);
      holdScrollSave(key, 800);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("click", onClick, true);

    // Refresh / PWA yang dibuka ulang: pulihkan posisi terakhir. Navigasi
    // pertama dokumen baru saja terjadi, jadi tidak ada efek samping.
    let navType = "";
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      navType = nav?.type ?? "";
    } catch {
      navType = "";
    }
    let cancelFirst: (() => void) | undefined;
    if (navType === "reload") {
      const y = readScroll(urlKey());
      if (y !== null) cancelFirst = restoreScroll(y);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("click", onClick, true);
      if (raf) cancelAnimationFrame(raf);
      cancelFirst?.();
      flushScrollStore();
    };
  }, []);

  // Pindah halaman: kembali → pulihkan, maju → mulai dari atas.
  useEffect(() => {
    const key = urlKey();
    // Muat pertama: tidak ada layar sebelumnya untuk dibandingkan.
    if (!lastKey.current) {
      lastKey.current = key;
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;

    let cancel: (() => void) | undefined;
    const popping = resolvePopNav(key);
    if (popping) {
      const y = readScroll(key);
      // Posisi 0 / belum pernah dicatat: layar itu memang dibuka dari atas.
      // Tanpa ini gulir halaman sebelumnya terbawa ke layar tujuan.
      if (y !== null && y > 0) cancel = restoreScroll(y);
      else window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    } else {
      // Maju: mulai dari atas seperti membuka layar baru. Posisi halaman
      // yang ditinggalkan sudah dicatat oleh listener klik/pop.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    return () => cancel?.();
  }, [pathname]);

  return null;
}
