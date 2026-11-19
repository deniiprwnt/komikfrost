"use client";

import { useEffect, useRef } from "react";

/**
 * Tombol back perangkat (Android / gestur browser) menutup lapisan UI paling
 * atas dulu — seperti aplikasi native — bukan meninggalkan halaman.
 *
 * Cara kerja: satu entri history "penanda" (URL sama) didorong saat lapisan
 * dibuka. Back menghabiskan entri itu, `onClose` dipanggil, URL tidak berubah.
 * Menutup lewat UI (X / backdrop / Escape) juga menghabiskan entri penanda,
 * supaya tombol back berikutnya tidak terasa "mati" karena tersangkut di
 * entri kosong.
 *
 * Catatan aman: saat komponen dilepas karena NAVIGASI (bukan karena ditutup),
 * posisi history sudah bukan penanda kita lagi — `history.back()` tidak
 * dipanggil, jadi navigasi yang sedang berjalan tidak dibatalkan.
 *
 * StrictMode (dev) menjalankan effect dua kali: mount → cleanup → mount.
 * Cleanup pertama tidak boleh langsung `history.back()`, karena popstate yang
 * dihasilkannya tiba setelah effect kedua terpasang dan akan menutup lapisan
 * yang baru saja dibuka ("modal muncul lalu langsung hilang"). Karena itu
 * back ditunda satu tick dan dibatalkan oleh effect yang menyusul.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const sentinel = useRef(false);
  const closeRef = useRef(onClose);
  const pendingBack = useRef<number | null>(null);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    // Effect menyusul (StrictMode remount) membatalkan teardown yang tertunda.
    if (pendingBack.current !== null) {
      window.clearTimeout(pendingBack.current);
      pendingBack.current = null;
    }

    const onSentinel =
      (window.history.state as { __kfSheet?: unknown } | null)?.__kfSheet === true;
    if (!onSentinel) {
      try {
        const prev = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.pushState({ ...prev, __kfSheet: true }, "", window.location.href);
      } catch {
        // pushState bisa ditolak di sandbox — lapisan tetap bisa ditutup UI.
      }
    }
    sentinel.current =
      (window.history.state as { __kfSheet?: unknown } | null)?.__kfSheet === true;

    const onPop = () => {
      if (!sentinel.current) return;
      sentinel.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      const stillOnSentinel =
        sentinel.current &&
        (window.history.state as { __kfSheet?: unknown } | null)?.__kfSheet === true;
      sentinel.current = false;
      if (!stillOnSentinel) return;
      // Ditunda: cleanup yang langsung disusul effect baru = remount, bukan tutup.
      pendingBack.current = window.setTimeout(() => {
        pendingBack.current = null;
        try {
          window.history.back();
        } catch {
          // abaikan — entri penanda hanya tersisa satu, tidak merusak UI.
        }
      }, 0);
    };
  }, [open]);
}
