"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  /** Teks kecil di kanan (mis. tanggal chapter). */
  hint?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Dipakai sebagai aria-label tombol + judul bottom sheet di HP. */
  label: string;
  className?: string;
  /** Tombol diberi aksen saat nilainya bukan opsi pertama (filter aktif). */
  highlightActive?: boolean;
  /** Tampilkan kolom cari bila opsi >= angka ini (default 10). */
  searchFrom?: number;
  disabled?: boolean;
}

const MOBILE_QUERY = "(max-width: 639px)";

function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 dark:text-muted-dark ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

/**
 * Pengganti <select> native: sudut seragam dengan tombol lain (rounded-lg),
 * daftar pilihan modern & responsif —
 *  • ≥640px : popover di bawah tombol (otomatis ke atas bila kurang ruang)
 *  • <640px : bottom sheet dengan target sentuh besar
 * Keyboard: ↑ ↓ Home End Enter Esc + ketik huruf untuk lompat.
 */
export function Select({
  value,
  onChange,
  options,
  label,
  className = "",
  highlightActive = true,
  searchFrom = 10,
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeRef = useRef({ buf: "", t: 0 });
  const isMobile = useIsMobile();
  const uid = useId();
  const listId = `${uid}-list`;

  const selected = options.find((o) => o.value === value);
  const searchable = options.length >= searchFrom;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx);
    setOpen(true);
  }, [disabled, options, value]);

  const pick = useCallback(
    (o: SelectOption) => {
      if (o.disabled) return;
      if (o.value !== value) onChange(o.value);
      close();
    },
    [value, onChange, close],
  );

  // Posisi popover (desktop): fixed + portal supaya tidak terpotong overflow induk.
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const gap = 6;
    const below = vh - r.bottom - gap - 12;
    const above = r.top - gap - 12;
    const flip = below < 220 && above > below;
    const width = Math.min(Math.max(r.width, 208), vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    setPos(
      flip
        ? { left, bottom: vh - r.top + gap, width, maxH: Math.min(360, above) }
        : { left, top: r.bottom + gap, width, maxH: Math.min(360, below) },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobile) return;
    place();
    const on = () => place();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, isMobile, place]);

  // Klik di luar + Esc. Kunci scroll body saat sheet HP terbuka.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    let prevOverflow = "";
    if (isMobile) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      if (isMobile) document.body.style.overflow = prevOverflow;
    };
  }, [open, isMobile, close]);

  // Fokus ke panel / kolom cari + gulir ke opsi terpilih saat dibuka.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const search = panelRef.current?.querySelector<HTMLInputElement>("input[data-select-search]");
      // Di HP jangan auto-fokus input (keyboard menutup separuh sheet).
      if (search && !isMobile) search.focus({ preventScroll: true });
      else panelRef.current?.focus({ preventScroll: true });
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, isMobile]);

  // Jaga item aktif terlihat saat navigasi keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const move = (dir: 1 | -1, from = active) => {
    if (filtered.length === 0) return;
    let i = from;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + dir + filtered.length) % filtered.length;
      if (!filtered[i].disabled) {
        setActive(i);
        return;
      }
    }
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (!searchable) {
          e.preventDefault();
          move(1, -1);
        }
        break;
      case "End":
        if (!searchable) {
          e.preventDefault();
          move(-1, 0);
        }
        break;
      case "Enter":
      case " ":
        if (e.key === " " && searchable) break;
        e.preventDefault();
        if (active >= 0 && filtered[active]) pick(filtered[active]);
        break;
      case "Tab":
        close(false);
        break;
      default:
        // Type-ahead untuk daftar tanpa kolom cari.
        if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const ty = typeRef.current;
          window.clearTimeout(ty.t);
          ty.buf += e.key.toLowerCase();
          ty.t = window.setTimeout(() => (ty.buf = ""), 600);
          const idx = filtered.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(ty.buf));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  };

  const isActiveFilter = highlightActive && value !== "" && value !== options[0]?.value;

  const list = (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={label}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
    >
      {filtered.length === 0 && (
        <li className="px-3 py-6 text-center text-sm text-muted dark:text-muted-dark">Tidak ada hasil</li>
      )}
      {filtered.map((o, i) => {
        const isSel = o.value === value;
        const isAct = i === active;
        return (
          <li
            key={o.value || "__empty"}
            role="option"
            data-idx={i}
            aria-selected={isSel}
            aria-disabled={o.disabled || undefined}
            onMouseMove={() => !o.disabled && active !== i && setActive(i)}
            onClick={() => pick(o)}
            className={`flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-[15px] sm:min-h-9 sm:py-1.5 sm:text-sm ${
              o.disabled
                ? "cursor-not-allowed opacity-40"
                : isAct
                  ? "bg-paper-3 dark:bg-ink-3"
                  : ""
            } ${isSel ? "font-semibold text-accent" : "text-fg dark:text-fg-dark"}`}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.hint && <span className="shrink-0 text-[11px] font-normal text-muted dark:text-muted-dark">{o.hint}</span>}
            {isSel && <Check />}
          </li>
        );
      })}
    </ul>
  );

  const searchBox = searchable && (
    <div className="shrink-0 border-b border-line p-2 dark:border-line-dark">
      <div className="search-wrap relative">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-muted-dark" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3.5 3.5" />
        </svg>
        <input
          data-select-search
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Cari…"
          aria-label={`Cari ${label}`}
          aria-controls={listId}
          autoComplete="off"
          className="search-field h-10 w-full rounded-lg border border-line bg-paper px-3 pl-8 text-sm text-fg outline-none placeholder:text-muted sm:h-9 dark:border-line-dark dark:bg-ink dark:text-fg-dark dark:placeholder:text-muted-dark"
        />
      </div>
    </div>
  );

  const surface = "border border-line bg-paper-2 text-fg dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark";

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          isMobile ? (
            <div className="fixed inset-0 z-[100]">
              <div className="select-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => close()} aria-hidden />
              <div
                ref={panelRef}
                tabIndex={-1}
                onKeyDown={onPanelKey}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                className={`select-sheet absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-3xl outline-none ${surface} border-b-0`}
              >
                <div className="flex shrink-0 flex-col items-center px-4 pb-1 pt-2.5">
                  <span className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" aria-hidden />
                  <div className="mt-2.5 flex w-full items-center justify-between">
                    <h2 className="font-display text-sm font-bold">{label}</h2>
                    <button
                      type="button"
                      onClick={() => close()}
                      aria-label="Tutup"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted active:bg-paper-3 dark:text-muted-dark dark:active:bg-ink-3"
                    >
                      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="m5 5 10 10M15 5 5 15" />
                      </svg>
                    </button>
                  </div>
                </div>
                {searchBox}
                {list}
                <div className="shrink-0 pb-[env(safe-area-inset-bottom,0px)]" />
              </div>
            </div>
          ) : pos ? (
            <div
              ref={panelRef}
              tabIndex={-1}
              onKeyDown={onPanelKey}
              role="dialog"
              aria-label={label}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}
              className={`select-pop fixed z-[100] flex flex-col overflow-hidden rounded-xl shadow-xl shadow-black/15 outline-none dark:shadow-black/50 ${surface} ${pos.bottom !== undefined ? "origin-bottom" : "origin-top"}`}
            >
              {searchBox}
              {list}
            </div>
          ) : null,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`touch-target flex h-10 min-w-0 touch-manipulation items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-[color,border-color,background-color] sm:h-9 sm:text-[13px] ${
          open
            ? "border-accent bg-paper-2 text-fg dark:bg-ink-2 dark:text-fg-dark"
            : isActiveFilter
              ? "border-accent/60 bg-accent-soft text-accent-strong dark:bg-accent-soft-dark dark:text-fg-dark"
              : "border-line bg-paper-2 text-fg hover:border-accent/60 dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark"
        } disabled:opacity-50 ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? options[0]?.label ?? ""}</span>
        <Chevron open={open} />
      </button>
      {overlay}
    </>
  );
}
