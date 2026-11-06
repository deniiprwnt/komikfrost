"use client";

import { useEffect, useRef } from "react";

/**
 * Refresh otomatis daftar saat ada komik baru — tanpa reload manual
 * (penting di PWA yang tidak punya tombol reload).
 * - Polling tiap `intervalMs` (default 4 dtk) hanya saat tab terlihat.
 * - Refresh langsung saat PWA kembali ke foreground (visibility/focus),
 *   saat online kembali, dan saat pageshow (back-forward cache).
 * - Callback wajib silent: sukses → update diam-diam, gagal → abaikan
 *   (tidak mengutak-atik error/loading yang sedang tampil).
 */
export function useAutoRefresh(cb: () => void, intervalMs = 4_000) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const visible = () => document.visibilityState === "visible";
    const tick = () => {
      if (!visible()) return;
      try {
        cbRef.current();
      } catch {
        // Refresh background boleh gagal diam-diam.
      }
    };
    const onVisibility = () => {
      if (visible()) tick();
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [intervalMs]);
}
