"use client";

import { useEffect } from "react";

/**
 * Mengunci zoom agar halaman terasa seperti aplikasi native.
 *
 * `user-scalable=no` diabaikan Safari iOS sejak iOS 10, jadi pinch-zoom
 * dan double-tap zoom dicegah juga lewat event. Di desktop, Ctrl+scroll
 * dan Ctrl +/-/0 ikut diblokir. Tidak ada UI yang dirender.
 */
export function NoZoom() {
  useEffect(() => {
    const opts = { passive: false } as const;

    // Safari iOS: gesture pinch.
    const stop = (e: Event) => e.preventDefault();

    // Pinch dua jari (Android/iOS) — touchmove dengan >1 sentuhan.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    // Double-tap zoom (iOS) — dua tap beruntun < 300ms.
    let lastTap = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 300) e.preventDefault();
      lastTap = now;
    };

    // Desktop: Ctrl + scroll roda mouse / pinch trackpad.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    // Desktop: Ctrl/Cmd + (+, -, =, 0).
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (["+", "-", "=", "0", "_"].includes(e.key)) e.preventDefault();
    };

    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("gestureend", stop, opts);
    document.addEventListener("touchmove", onTouchMove, opts);
    document.addEventListener("touchend", onTouchEnd, opts);
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
