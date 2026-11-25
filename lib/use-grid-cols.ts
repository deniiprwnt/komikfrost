"use client";

import { useEffect, useState } from "react";

/* Harus sama dengan kolom grid kartu: 2 (default), 3 (min 560px), 4 (lg), 5 (xl). */
const BREAKPOINTS: Array<[string, number]> = [
  ["(min-width: 1280px)", 5],
  ["(min-width: 1024px)", 4],
  ["(min-width: 560px)", 3],
];

function readCols(): number {
  for (const [q, n] of BREAKPOINTS) if (window.matchMedia(q).matches) return n;
  return 2;
}

/** Jumlah kolom grid kartu saat ini. 0 sebelum mount (SSR) = jangan memangkas. */
export function useGridCols(): number {
  const [cols, setCols] = useState(0);
  useEffect(() => {
    const update = () => setCols(readCols());
    update();
    const mqs = BREAKPOINTS.map(([q]) => window.matchMedia(q));
    mqs.forEach((m) => m.addEventListener("change", update));
    return () => mqs.forEach((m) => m.removeEventListener("change", update));
  }, []);
  return cols;
}

/**
 * Pangkas ke kelipatan jumlah kolom supaya baris terakhir penuh. Hanya bila
 * masih ada halaman berikutnya; halaman terakhir ditampilkan utuh agar tidak
 * ada judul yang hilang.
 */
export function fitToRows<T>(items: T[], cols: number, hasNext: boolean): T[] {
  if (!hasNext || cols <= 0) return items;
  const n = Math.floor(items.length / cols) * cols;
  return n > 0 ? items.slice(0, n) : items;
}
