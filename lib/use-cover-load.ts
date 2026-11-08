"use client";

import { useCallback, useState } from "react";

export type CoverState = "loading" | "loaded" | "error";

/**
 * Status muat cover untuk <img> yang dirender server.
 *
 * `ref` memeriksa gambar yang SUDAH selesai sebelum React memasang `onLoad`
 * (cover dari cache / hidrasi lambat). Tanpa pemeriksaan ini event `load`
 * tidak pernah terpanggil dan cover yang di-gate `opacity-0` tetap tak
 * terlihat di balik shimmer — bug "cover tidak muncul" di beranda & /terbaru.
 */
export function useCoverLoad() {
  const [state, setState] = useState<CoverState>("loading");

  const ref = useCallback((el: HTMLImageElement | null) => {
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0) {
      el.classList.add("blur-done");
      setState("loaded");
    } else {
      // complete tapi tak punya piksel = gagal dimuat.
      setState("error");
    }
  }, []);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.classList.add("blur-done");
    setState("loaded");
  }, []);

  const onError = useCallback(() => setState("error"), []);

  return { state, ref, onLoad, onError };
}
