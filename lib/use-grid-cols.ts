"use client";

import { useEffect, useState } from "react";

/* Harus sama dengan kolom grid kartu: 2 (default), 3 (min 560px), 4 (lg), 5 (xl), 6 (2xl). */
/* Varian sempit (daftar di kolom kiri halaman detail): maksimal 3 kolom, 4 hanya di layar sangat lebar. */
const COMPACT_BREAKPOINTS: Array<[string, number]> = [
  ["(min-width: 1536px)", 4],
  ["(min-width: 560px)", 3],
];

const BREAKPOINTS: Array<[string, number]> = [
  ["(min-width: 1536px)", 6],
  ["(min-width: 1280px)", 5],
  ["(min-width: 1024px)", 4],
  ["(min-width: 560px)", 3],
];

function readCols(bps: Array<[string, number]>): number {
  for (const [q, n] of bps) if (window.matchMedia(q).matches) return n;
  return 2;
}

/** Jumlah kolom grid kartu saat ini. 0 sebelum mount (SSR) = jangan memangkas. */
export function useGridCols(compact = false): number {
  const [cols, setCols] = useState(0);
  useEffect(() => {
    const bps = compact ? COMPACT_BREAKPOINTS : BREAKPOINTS;
    const update = () => setCols(readCols(bps));
    update();
    const mqs = bps.map(([q]) => window.matchMedia(q));
    mqs.forEach((m) => m.addEventListener("change", update));
    return () => mqs.forEach((m) => m.removeEventListener("change", update));
  }, [compact]);
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
