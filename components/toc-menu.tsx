"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type TocChapter = {
  title: string;
  /** URL chapter dari sumber, mis. "/slug-chapter-11-2/". */
  url: string;
  date?: string;
};

export type TocControl = {
  /** null = belum dimuat, [] = gagal / kosong. Urutan dari server: terbaru dulu. */
  chapters: TocChapter[] | null;
  /** Token chapter yang sedang dibaca (mis. "11-2"). */
  current: string;
  /** Slug komik — untuk tautan cadangan ke halaman detail. */
  slug: string;
  /** Dipanggil saat menu dibuka/ditutup (menahan auto-sembunyi overlay). */
  onOpenChange?: (open: boolean) => void;
};

/** Token route dari URL chapter; sufiks "-bahasa-indonesia" dibuang (sama seperti chapterPathToRoute). */
function chapterToken(url: string): string {
  const tok = url.match(/-chapter-(.+?)\/?$/)?.[1] ?? "";
  return tok.replace(/-bahasa-indonesia$/i, "");
}

function IconList({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLocate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Tombol "Daftar isi" + popover daftar chapter. Dirender sebagai fragment di
 * dalam <nav className="relative">, persis seperti ZoomMenu (Settings):
 * tombol = satu sel grid, popover = absolute selebar nav sehingga tidak
 * pernah keluar layar di HP.
 *
 * Isi popover: header + tombol "Chapter ini" (kembali ke chapter yang sedang
 * dibaca di dalam daftar), kolom cari, pengurut, lalu daftar chapter.
 */
export function TocMenu({
  toc,
  placement = "top",
}: {
  toc: TocControl;
  /** "top" = membuka ke atas nav, "bottom" = ke bawah nav. */
  placement?: "top" | "bottom";
}) {
  const { chapters, current, slug, onOpenChange } = toc;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // false = terbaru dulu (urutan server), true = terlama dulu.
  const [asc, setAsc] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const setOpenNotify = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };
  // Simpan versi terbaru agar listener global tidak basi.
  const closeRef = useRef(() => {});
  closeRef.current = () => setOpenNotify(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Dilepas saat menu masih terbuka: beri tahu induk supaya tidak terjebak
  // status "terbuka".
  const openRef = useRef(false);
  openRef.current = open;
  const notifyRef = useRef(onOpenChange);
  notifyRef.current = onOpenChange;
  useEffect(() => {
    return () => {
      if (openRef.current) notifyRef.current?.(false);
    };
  }, []);

  const items = useMemo(() => {
    const base = (chapters ?? []).flatMap((c) => {
      const tok = chapterToken(c.url);
      return tok ? [{ ...c, tok }] : [];
    });
    const ordered = asc ? [...base].reverse() : base;
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((c) => c.title.toLowerCase().includes(q) || c.tok.toLowerCase().includes(q));
  }, [chapters, asc, query]);

  const total = chapters?.length ?? 0;
  const hasCurrent = (chapters ?? []).some((c) => chapterToken(c.url) === current);

  /** Gulir daftar sehingga chapter aktif berada di tengah (hanya scroller daftar, bukan halaman). */
  const scrollToCurrent = (smooth: boolean) => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !el) return;
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  };

  // Saat dibuka / daftar tiba / urutan berubah: langsung tampilkan chapter aktif.
  useLayoutEffect(() => {
    if (open) scrollToCurrent(false);
  }, [open, asc, chapters]);

  const backToCurrent = () => {
    // Bila sedang memfilter, bersihkan dulu agar chapter aktif ada di daftar.
    setQuery("");
    requestAnimationFrame(() => scrollToCurrent(true));
  };

  const sortBtn =
    "touch-manipulation rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpenNotify(!open)}
        aria-label="Daftar isi"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        title="Daftar isi"
        className={`flex h-11 w-11 touch-manipulation items-center justify-center gap-2 rounded-xl transition-[background-color,color,transform] duration-200 active:scale-95 sm:h-12 sm:w-auto sm:px-4 sm:text-sm sm:font-medium ${
          open
            ? "bg-accent-soft text-accent-strong dark:bg-accent/15 dark:text-accent-strong"
            : "text-muted hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
        }`}
      >
        <IconList className="h-[18px] w-[18px] shrink-0" />
        <span className="hidden sm:inline">Daftar isi</span>
      </button>

      {open && (
        <div
          ref={popRef}
          id={id}
          role="dialog"
          aria-label="Daftar isi"
          className={`${placement === "top" ? "zoom-pop-up bottom-full mb-2" : "zoom-pop-down top-full mt-2"} absolute inset-x-0 z-50 flex flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 shadow-[0_16px_36px_-14px_rgba(8,28,32,0.5)] dark:border-line-dark dark:bg-ink-2 dark:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.9)]`}
        >
          {/* Header + menu: kembali ke chapter yang sedang dibaca */}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate px-1 text-xs font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
              Daftar isi{total > 0 ? ` (${total})` : ""}
            </p>
            {hasCurrent && (
              <button
                type="button"
                onClick={backToCurrent}
                title="Kembali ke chapter yang sedang dibaca"
                className="flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-accent/50 bg-accent-soft px-3 text-xs font-semibold text-accent-strong transition-[background-color,transform] active:scale-95 dark:bg-accent/15"
              >
                <IconLocate className="h-4 w-4 shrink-0" />
                Chapter ini
              </button>
            )}
          </div>

          {chapters === null ? (
            <p role="status" className="px-1 py-6 text-center text-sm text-muted dark:text-muted-dark">
              Memuat daftar chapter…
            </p>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-3 px-1 py-5 text-center">
              <p className="text-sm text-muted dark:text-muted-dark">Daftar chapter belum bisa dimuat.</p>
              <Link
                href={`/komik/${slug}`}
                onClick={() => setOpenNotify(false)}
                className="min-h-11 touch-manipulation rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.97]"
              >
                Buka halaman detail komik
              </Link>
            </div>
          ) : (
            <>
              {/* Cari + urutan: hanya bila daftar cukup panjang */}
              {total > 8 && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-muted-dark" />
                    <input
                      type="search"
                      inputMode="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari chapter, mis. 12"
                      aria-label="Cari chapter"
                      className="h-11 w-full rounded-xl border border-line bg-paper pl-9 pr-3 text-base text-fg outline-none placeholder:text-muted focus:border-accent/60 sm:text-sm dark:border-line-dark dark:bg-ink-3/70 dark:text-fg-dark dark:placeholder:text-muted-dark"
                    />
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Urutan chapter">
                    {([false, true] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setAsc(v)}
                        aria-pressed={asc === v}
                        className={`${sortBtn} ${
                          asc === v
                            ? "border-accent/50 bg-accent-soft text-accent-strong dark:bg-accent/15 dark:text-accent-strong"
                            : "border-line text-muted hover:bg-paper-3 hover:text-fg dark:border-line-dark dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
                        }`}
                      >
                        {v ? "Terlama" : "Terbaru"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <p className="px-1 py-5 text-center text-sm text-muted dark:text-muted-dark">
                  Chapter “{query.trim()}” tidak ditemukan.
                </p>
              ) : (
                <ul
                  ref={listRef}
                  className="relative -mr-1 flex max-h-[min(55vh,22rem)] min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1"
                >
                  {items.map((c, i) => {
                    const active = c.tok === current;
                    return (
                      <li key={`${c.tok}-${i}`}>
                        <Link
                          href={`/baca/${slug}/${c.tok}`}
                          onClick={() => setOpenNotify(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-11 touch-manipulation items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
                            active
                              ? "border-accent/50 bg-accent-soft font-semibold text-accent-strong dark:bg-accent/15 dark:text-accent-strong"
                              : "border-transparent text-fg hover:bg-paper-3 dark:text-fg-dark dark:hover:bg-ink-3"
                          }`}
                        >
                          <span className="min-w-0 truncate">{c.title}</span>
                          {active ? (
                            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Dibaca
                            </span>
                          ) : (
                            c.date && (
                              <span className="shrink-0 text-[11px] tabular-nums text-muted dark:text-muted-dark">
                                {c.date}
                              </span>
                            )
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
