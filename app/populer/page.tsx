"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, peekApiCacheStale, prefetchApi, readApiSnapshot } from "@/lib/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { usePageTitle } from "@/lib/page-title";
import type { MangaCard } from "@/lib/api/types";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";
import { RankListSkeleton, PopulerSkeleton } from "@/components/skeletons";
import { RankList } from "@/components/rank-list";

const PERIODS = [
  { v: "harian", label: "Harian" },
  { v: "mingguan", label: "Mingguan" },
  { v: "bulanan", label: "Bulanan" },
  { v: "total", label: "Semua waktu" },
] as const;

function PopulerContent() {
  const sp = useSearchParams();
  const raw = sp?.get("period") || "harian";
  const period = PERIODS.some((p) => p.v === raw) ? raw : "harian";
  usePageTitle(
    `Peringkat ${PERIODS.find((p) => p.v === period)?.label ?? "Harian"}`,
  );
  // Cache dari prefetch menu / kunjungan sebelumnya dipakai sebagai state
  // awal agar halaman langsung terisi — termasuk kembali dari halaman komik
  // (cache memori basi maupun snapshot disk setelah PWA dimuat ulang).
  const [items, setItems] = useState<MangaCard[] | null>(() => {
    const path = `/api/popular?period=${period}`;
    const cached =
      peekApiCacheStale<{ period: string; items: MangaCard[] }>(path) ??
      readApiSnapshot<{ period: string; items: MangaCard[] }>(path);
    return cached?.items ?? null;
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    const path = `/api/popular?period=${period}`;
    const shown =
      peekApiCacheStale<{ period: string; items: MangaCard[] }>(path) ??
      readApiSnapshot<{ period: string; items: MangaCard[] }>(path);
    // Hanya kosongkan bila tidak ada isi yang layak tampil; kalau ada,
    // daftar lama tetap terlihat sampai data baru tiba (tanpa skeleton).
    if (!shown?.items?.length) setItems(null);
    try {
      const res = await apiGet<{ period: string; items: MangaCard[] }>(
        path,
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
      // Jangan kehilangan angka baca yang sudah tampil bila respons baru
      // kebetulan gagal melengkapinya (pencarian angka bisa lambat).
      const oldViews = new Map(cur.map((i) => [i.slug, i.views]));
      const next = res.items.map((i) =>
        i.views || !oldViews.get(i.slug) ? i : { ...i, views: oldViews.get(i.slug) },
      );
      // Seluruh daftar dibandingkan: urutan peringkat, angka baca, chapter.
      const sig = (l: MangaCard[]) =>
        l
          .map((i) => `${i.slug}#${i.rank ?? ""}#${i.views ?? ""}#${i.latestChapter?.url ?? ""}`)
          .join("|");
      if (sig(next) === sig(cur)) return;
      setItems(next);
    } catch {
      // Abaikan — daftar lama tetap tampil.
    }
  }, [period]);
  // Peringkat populer tidak berubah cepat — polling jarang saja.
  useAutoRefresh(silentCheck, 120_000);

  return (
    <section className="flex min-w-0 flex-col gap-3 sm:gap-4">
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
              className={`shrink-0 rounded-[var(--r-pill)] border px-4 py-2 text-xs font-semibold transition-colors sm:py-1.5 ${
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
      {!items && !error && <RankListSkeleton count={10} />}
      {error && <ErrorState message={error} onRetry={() => load()} />}
      {items && items.length === 0 && (
        <EmptyState message="Belum ada data peringkat dari sumber data." />
      )}
      {items && items.length > 0 && (
        <RankList items={items} />
      )}
    </section>
  );
}

export default function PopulerPage() {
  return (
    <Suspense fallback={<PopulerSkeleton />}>
      <PopulerContent />
    </Suspense>
  );
}
