"use client";

/**
 * Tombol X untuk mengosongkan kolom cari. Diposisikan absolute: pasang di
 * dalam pembungkus `relative` dan atur sisi lewat `className` (mis. "right-2.5").
 * Dipakai bersama oleh pencarian header dan kolom cari genre.
 */
export function ClearButton({
  onClear,
  className = "",
  label = "Hapus pencarian",
}: {
  onClear: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      title={label}
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
