"use client";

import Link from "next/link";
import { useState } from "react";
import { timeAgo, useHistory } from "@/lib/history";
import { usePageTitle } from "@/lib/page-title";
import { useNowTick } from "@/lib/relative-time";
import { SectionHead, EmptyState } from "@/components/states";
import { CoverImage } from "@/components/cover-image";

function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v5.5M14 11v5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RiwayatPage() {
  usePageTitle("Riwayat Baca");
  const { entries, remove, clear } = useHistory();
  const now = useNowTick();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 sm:gap-4 sm:p-4 dark:border-line-dark dark:bg-ink-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SectionHead title="Riwayat Baca" />
          {entries.length > 0 && (
            <p className="-mt-2 text-xs text-muted dark:text-muted-dark">
              {entries.length} judul · tersimpan otomatis di perangkat ini
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/favorit"
            className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-accent hover:border-accent sm:py-1.5 dark:border-line-dark"
          >
            Favorit →
          </Link>
          {entries.length > 0 && !confirmClear && (
            <button
              onClick={() => setConfirmClear(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-muted hover:border-mark-manga hover:text-mark-manga sm:py-1.5 dark:border-line-dark dark:text-muted-dark"
            >
              <IconTrash className="h-3.5 w-3.5" />
              Hapus semua
            </button>
          )}
        </div>
      </div>

      {confirmClear && entries.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-mark-manga/30 bg-mark-manga/5 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-mark-manga">
            Hapus seluruh riwayat baca di perangkat ini?
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-fg dark:border-line-dark dark:text-fg-dark"
            >
              Batal
            </button>
            <button
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
              className="rounded-lg bg-mark-manga px-4 py-1.5 text-xs font-semibold text-white"
            >
              Ya, hapus
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState message="Belum ada riwayat. Buka chapter mana pun dan posisi bacamu tersimpan otomatis di sini." />
      )}

      {entries.length > 0 && (
        <div className="min-w-0 divide-y divide-line dark:divide-line-dark">
          {entries.map((h) => (
            <article key={h.slug} className="flex min-w-0 items-center gap-2.5 p-2.5 sm:gap-3 sm:p-3">
              <Link
                href={h.route}
                aria-label={`${h.title} — ${h.chapterLabel}`}
                className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-paper-3 min-[420px]:h-24 min-[420px]:w-[68px] dark:bg-ink-3"
              >
                <CoverImage src={h.cover} alt="" title={h.title} className="h-full w-full object-cover" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/komik/${h.slug}`}
                  className="truncate text-[13px] font-semibold leading-snug text-fg hover:text-accent sm:text-sm dark:text-fg-dark"
                >
                  {h.title}
                </Link>
                <p className="mt-0.5 truncate text-[11px] text-muted sm:text-xs dark:text-muted-dark">
                  {h.chapterLabel}
                  {h.progress > 0 ? ` · ${Math.round(h.progress * 100)}%` : ""}
                  {" · "}
                  {timeAgo(h.updatedAt, now ?? Date.now())}
                </p>
                {/* Progress bar posisi baca */}
                <div className="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-paper-3 dark:bg-ink-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(h.progress * 100)}%` }} />
                </div>
                <Link
                  href={h.route}
                  className="mt-1.5 w-fit rounded-lg bg-accent px-3.5 py-1.5 text-[11px] font-semibold text-white sm:text-xs"
                >
                  Lanjutkan
                </Link>
              </div>
              <button
                onClick={() => remove(h.slug)}
                aria-label={`Hapus ${h.title} dari riwayat`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-mark-manga sm:h-9 sm:w-9 dark:text-muted-dark dark:hover:bg-ink"
              >
                <IconTrash className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
