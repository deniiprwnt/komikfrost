"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Fallback error global — tampil saat sebuah route crash saat render.
 * `reset()` mencoba render ulang segmen yang gagal tanpa reload penuh.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Gagal render = bug, bukan data upstream — cukup catat digest.
    if (error.digest) console.error(`[route-error digest=${error.digest}]`);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-14 text-center sm:py-20 dark:border-danger-dark/30 dark:bg-danger-dark/10"
    >
      <h1 className="font-display text-lg font-extrabold text-fg sm:text-xl dark:text-fg-dark">
        Halaman gagal dimuat
      </h1>
      <p className="max-w-sm text-sm text-muted dark:text-muted-dark">
        Coba muat ulang halamannya. Kalau masih gagal, kembali ke beranda.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Coba lagi
        </button>
        <Link
          href="/"
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-fg dark:border-line-dark dark:text-fg-dark"
        >
          Beranda
        </Link>
      </div>
    </div>
  );
}
