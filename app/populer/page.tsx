"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, peekApiCache, prefetchApi } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { usePageTitle } from "@/lib/page-title";
import type { MangaCard } from "@/lib/api/types";
import { SectionHead, ListSkeleton, ErrorState, EmptyState } from "@/components/states";
import { RankRow } from "@/components/cards";

const PERIODS = [
  { v: "harian", label: "Harian" },
  { v: "mingguan", label: "Mingguan" },
  { v: "bulanan", label: "Bulanan" },
  { v: "total", label: "Semua waktu" },
] as const;

function PopulerContent() {
  const sp = useSearchParams();
  const raw = sp.get("period") || "harian";
  const period = PERIODS.some((p) => p.v === raw) ? raw : "harian";
  usePageTitle(
    `Peringkat ${PERIODS.find((p) => p.v === period)?.label ?? "Harian"}`,
  );
  // Cache dari prefetch menu (hover/idle) dipakai sebagai state awal agar
  // halaman langsung terisi, bukan menampilkan skeleton seperti reload.
  const [items, setItems] = useState<MangaCard[] | null>(() => {
    const cached = peekApiCache<{ period: string; items: MangaCard[] }>(
      `/api/popular?period=${period}`,
    );
    return cached?.items ?? null;
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    // Ganti periode tanpa cache: kosongkan agar skeleton tampil. Bila cache
    // prefetch sudah ada, biarkan daftar tampil sampai data baru tiba.
    if (!peekApiCache<{ period: string; items: MangaCard[] }>(`/api/popular?period=${period}`)) {
      setItems(null);
    }
    try {
      const res = await apiGet<{ period: string; items: MangaCard[] }>(
        `/api/popular?period=${period}`,
        signal ? { signal } : undefined,
      );
      setItems(res.items);
    } catch (e) {
      // Dibatalkan efek (periode berganti) — bukan kegagalan.
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    }
  }, [period]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Auto-refresh PWA: cek diam-diam tiap interval, ganti daftar HANYA
  // bila ada yang baru (3 teratas berubah). Tanpa skeleton, tanpa
  // menyentuh error — gagal = abaikan.
  const itemsRef = useRef<MangaCard[] | null>(null);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const silentCheck = useCallback(async () => {
    const cur = itemsRef.current;
    if (!cur || cur.length === 0) return;
    try {
      const res = await apiGet<{ period: string; items: MangaCard[] }>(
        `/api/popular?period=${period}`,
        { noStore: true },
      );
      if (!res.items || res.items.length === 0) return;
      const sig = (l: MangaCard[]) =>
        l
          .slice(0, 3)
          .map((i) => `${i.slug}#${i.latestChapter?.url ?? ""}`)
          .join("|");
      if (sig(res.items) === sig(cur)) return;
      setItems(res.items);
    } catch {
      // Abaikan — daftar lama tetap tampil.
    }
  }, [period]);
  // Peringkat populer tidak berubah cepat — polling jarang saja.
  useAutoRefresh(silentCheck, 60_000);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 sm:gap-4 sm:p-4 dark:border-line-dark dark:bg-ink-2">
      <SectionHead title="Peringkat Komik" />
      <div className="rail-scroll -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:px-0">
        {PERIODS.map((p) => {
          const active = period === p.v;
          return (
            <Link
              key={p.v}
              href={p.v === "harian" ? "/populer" : `/populer?period=${p.v}`}
              onMouseEnter={() => prefetchApi(`/api/popular?period=${p.v}`)}
              onTouchStart={() => prefetchApi(`/api/popular?period=${p.v}`)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors sm:py-1.5 ${
                active
                  ? "border-transparent bg-accent text-white"
                  : "border-line text-muted hover:text-fg dark:border-line-dark dark:text-muted-dark dark:hover:text-fg-dark"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      {!items && !error && <ListSkeleton count={10} />}
      {error && <ErrorState message={error} onRetry={() => load()} />}
      {items && items.length === 0 && (
        <EmptyState message="Belum ada data peringkat dari sumber data." />
      )}
      {items && items.length > 0 && (
        <div className="grid min-w-0 gap-2.5 lg:grid-cols-2 lg:gap-3">
          {items.map((item) => (
            <RankRow key={`${item.slug}#${item.latestChapter?.url ?? ""}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function PopulerPage() {
  return (
    <Suspense fallback={<ListSkeleton count={10} />}>
      <PopulerContent />
    </Suspense>
  );
}
