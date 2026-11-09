"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Menggulung halaman ke paling atas saat dipasang (mis. setelah user
 * mengklik komik). Selain window, semua wadah induk yang sedang tergulir
 * (mis. <main> ber-overflow di app shell) ikut di-reset. `behavior: "instant"`
 * mengabaikan `scroll-behavior: smooth` supaya tidak terlihat meluncur.
 */
export function ScrollToTop() {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const pos = { top: 0, left: 0, behavior: "instant" as ScrollBehavior };
    window.scrollTo(pos);
    let el: HTMLElement | null = ref.current?.parentElement ?? null;
    while (el && el !== document.documentElement) {
      if (el.scrollTop > 0) el.scrollTo(pos);
      el = el.parentElement;
    }
  }, []);

  return <span ref={ref} hidden aria-hidden="true" />;
}
