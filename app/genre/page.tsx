"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet, peekApiCache } from "@/lib/client";
import { usePageTitle } from "@/lib/page-title";
import type { GenreRef } from "@/lib/api/types";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";

function GenreSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-1.5 min-[420px]:gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="shimmer h-12 rounded-xl" />
      ))}
    </div>
  );
}

export default function GenreListPage() {
  usePageTitle("Daftar Genre");
  const [genres, setGenres] = useState<GenreRef[] | null>(
    () => peekApiCache<GenreRef[]>("/api/genres") ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Multi-pilih: maks 2 genre (batas filter sumber data genre+genre2).
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    // Cache prefetch (menu/hover) langsung dipakai; skeleton hanya bila
    // memang belum ada data sama sekali.
    if (!peekApiCache<GenreRef[]>("/api/genres")) setGenres(null);
    try {
      setGenres(await apiGet<GenreRef[]>("/api/genres"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = (genres || []).filter((g) =>
    g.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const toggle = (slug: string) => {
    setPicked((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 2) return [...prev.slice(1), slug];
      return [...prev, slug];
    });
  };

  const pickedNames = picked
    .map((s) => genres?.find((g) => g.slug === s)?.name ?? s)
    .filter(Boolean);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 sm:gap-4 sm:p-4 dark:border-line-dark dark:bg-ink-2">
      <SectionHead title="Daftar Genre" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ketik nama genre…"
        enterKeyHint="search"
        className="search-field h-12 w-full min-w-0 rounded-lg border border-line bg-paper-2 px-4 text-base text-fg outline-none placeholder:text-muted sm:h-10 sm:max-w-xs sm:text-sm dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
      />
      {picked.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-accent/40 bg-accent-soft/40 p-3 sm:p-4 dark:border-accent/30 dark:bg-accent-soft-dark/40">
          <p className="truncate text-xs font-semibold text-accent-strong sm:text-sm dark:text-accent">
            Dipilih ({picked.length}/2): {pickedNames.join(" + ")}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {picked.length === 1 && (
              <span className="text-[11px] text-muted sm:text-xs dark:text-muted-dark">
                Pilih 1 genre lagi, atau:
              </span>
            )}
            <Link
              href={picked.length === 1 ? `/genre/${picked[0]}` : `/terbaru?genre=${picked[0]}&genre2=${picked[1]}`}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white sm:text-[13px]"
            >
              {picked.length === 1 ? "Lihat genre ini" : "Lihat gabungan"}
            </Link>
            <button
              onClick={() => setPicked([])}
              className="shrink-0 rounded-lg border border-line px-4 py-2 text-xs font-semibold text-muted sm:text-[13px] dark:border-line-dark dark:text-muted-dark"
            >
              Reset
            </button>
          </div>
        </div>
      )}
      {!genres && !error && <GenreSkeleton />}
      {error && <ErrorState message={error} onRetry={load} />}
      {genres && filtered.length === 0 && (
        <EmptyState
          message={
            q ? `Genre "${q}" tidak ditemukan.` : "Belum ada genre dari sumber data."
          }
        />
      )}
      {filtered.length > 0 && (
        <div className="grid min-w-0 grid-cols-2 gap-1.5 min-[420px]:gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((g) => {
            const active = picked.includes(g.slug);
            return (
              <div
                key={g.slug}
                className={`flex min-h-12 min-w-0 items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2.5 transition-colors min-[420px]:px-3.5 min-[420px]:py-3 ${
                  active
                    ? "border-accent bg-accent-soft/50 dark:bg-accent-soft-dark/60"
                    : "border-line bg-paper-2 dark:border-line-dark dark:bg-ink-2"
                }`}
              >
                <Link
                  href={`/genre/${g.slug}`}
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg hover:text-accent sm:text-sm dark:text-fg-dark"
                >
                  {g.name}
                </Link>
                {typeof g.count === "number" && (
                  <span className="hidden shrink-0 rounded-lg bg-paper-3 px-1.5 py-0.5 text-[10px] tabular-nums text-muted min-[420px]:px-2 min-[420px]:text-[11px] sm:inline dark:bg-ink-3 dark:text-muted-dark">
                    {g.count.toLocaleString("id-ID")}
                  </span>
                )}
                <button
                  onClick={() => toggle(g.slug)}
                  aria-pressed={active}
                  aria-label={active ? `Batalkan genre ${g.name}` : `Pilih genre ${g.name}`}
                  className={`flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border text-base font-bold leading-none transition-colors ${
                    active
                      ? "border-transparent bg-accent text-white"
                      : "border-line text-muted hover:border-accent hover:text-accent dark:border-line-dark dark:text-muted-dark"
                  }`}
                >
                  {active ? "✓" : "+"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
