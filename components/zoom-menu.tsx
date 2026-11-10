"use client";

import { useEffect, useId, useRef, useState } from "react";

export type ZoomControl = {
  /** Ukuran gambar saat ini (%). */
  value: number;
  min: number;
  max: number;
  /** Langkah slider (%). */
  step: number;
  /** Nilai preset cepat (%). */
  presets: number[];
  onChange: (v: number) => void;
  /** Dipanggil saat menu dibuka/ditutup (mis. untuk menahan auto-sembunyi overlay). */
  onOpenChange?: (open: boolean) => void;
};

function IconSettings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconGlass({ plus, className }: { plus?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path
        d={plus ? "M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" : "M20 20l-4.2-4.2M8.5 11h5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Tombol zoom + popover (stepper − 100% + dan slider). Dirender sebagai
 * fragment di dalam <nav className="relative">: tombol = satu sel grid,
 * popover = absolute selebar nav sehingga tidak pernah keluar layar di HP.
 */
export function ZoomMenu({
  zoom,
  placement = "top",
}: {
  zoom: ZoomControl;
  /** "top" = membuka ke atas nav, "bottom" = ke bawah nav. */
  placement?: "top" | "bottom";
}) {
  const { value, min, max, step, presets, onChange, onOpenChange } = zoom;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
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

  // Komponen dilepas saat menu masih terbuka (mis. pindah chapter): beri
  // tahu induk supaya tidak terjebak status "terbuka".
  const openRef = useRef(false);
  openRef.current = open;
  const notifyRef = useRef(onOpenChange);
  notifyRef.current = onOpenChange;
  useEffect(() => {
    return () => {
      if (openRef.current) notifyRef.current?.(false);
    };
  }, []);

  // Stepper ±10, dirapikan ke kelipatan 10 (slider bisa berhenti di 105 dst.).
  const bump = (d: -1 | 1) => {
    const snapped = d > 0 ? Math.floor(value / 10) * 10 + 10 : Math.ceil(value / 10) * 10 - 10;
    onChange(Math.min(max, Math.max(min, snapped)));
  };

  const fill = `${((value - min) / (max - min)) * 100}%`;
  const stepBtn =
    "flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-line bg-paper text-xl leading-none text-fg transition-[background-color,transform,opacity] hover:bg-paper-3 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-paper disabled:active:scale-100 dark:border-line-dark dark:bg-ink-3/70 dark:text-fg-dark dark:hover:bg-ink-3 dark:disabled:hover:bg-ink-3/70";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpenNotify(!open)}
        aria-label={`Settings, ukuran gambar ${value} persen`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        title="Settings"
        className={`flex h-11 w-11 touch-manipulation items-center justify-center gap-2 rounded-xl transition-[background-color,color,transform] duration-200 active:scale-95 sm:h-12 sm:w-auto sm:px-4 sm:text-sm sm:font-medium ${
          open
            ? "bg-accent-soft text-accent-strong dark:bg-accent/15 dark:text-accent-strong"
            : value !== 100
              ? "text-accent-strong hover:bg-paper-3 dark:text-accent dark:hover:bg-ink-3"
              : "text-muted hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
        }`}
      >
        <IconSettings
          className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
        />
        <span className="hidden sm:inline">Settings</span>
      </button>

      {open && (
        <div
          ref={popRef}
          id={id}
          role="dialog"
          aria-label="Settings"
          className={`${placement === "top" ? "zoom-pop-up bottom-full mb-2" : "zoom-pop-down top-full mt-2"} absolute inset-x-0 z-50 flex flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 shadow-[0_16px_36px_-14px_rgba(8,28,32,0.5)] dark:border-line-dark dark:bg-ink-2 dark:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.9)]`}
        >
          <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted dark:text-muted-dark">
            Settings
          </p>

          {/* Menu 1: − 100% + */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => bump(-1)}
              disabled={value <= min}
              aria-label="Perkecil gambar"
              className={stepBtn}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => onChange(100)}
              aria-label={`Ukuran ${value} persen — kembalikan ke 100 persen`}
              title="Kembalikan ke 100%"
              className={`h-11 min-w-20 touch-manipulation rounded-xl px-3 text-center text-lg font-bold tabular-nums transition-colors hover:bg-paper-3 dark:hover:bg-ink-3 ${
                value === 100 ? "text-muted dark:text-muted-dark" : "text-accent-strong dark:text-accent-strong"
              }`}
            >
              {value}%
            </button>
            <button
              type="button"
              onClick={() => bump(1)}
              disabled={value >= max}
              aria-label="Perbesar gambar"
              className={stepBtn}
            >
              +
            </button>
          </div>

          {/* Menu 2: slider + preset */}
          <div className="flex items-center gap-2.5 px-1">
            <IconGlass className="h-4 w-4 shrink-0 text-muted dark:text-muted-dark" />
            <input
              type="range"
              className="zoom-range min-w-0 flex-1"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-label="Ukuran gambar (slider)"
              aria-valuetext={`${value} persen`}
              style={{ "--fill": fill } as React.CSSProperties}
            />
            <IconGlass plus className="h-5 w-5 shrink-0 text-muted dark:text-muted-dark" />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                aria-pressed={value === p}
                className={`touch-manipulation rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                  value === p
                    ? "border-accent/50 bg-accent-soft text-accent-strong dark:bg-accent/15 dark:text-accent-strong"
                    : "border-line text-muted hover:bg-paper-3 hover:text-fg dark:border-line-dark dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
