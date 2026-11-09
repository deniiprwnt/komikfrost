"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen, bsGhost, bsPrimary, IconHome, IconRefresh } from "@/components/bare-screen";
import { Burst } from "@/components/scene-props";

/**
 * Fallback error global (500) — tampil saat sebuah route crash saat render.
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
    <StatusScreen
      code="500"
      tone="red"
      mood="dizzy"
      label="Terjadi kesalahan"
      jp="サーバーエラー"
      sfx={{ jp: "ボンッ！", romaji: "bon!" }}
      bubble="Ada yang korslet…"
      title="Ada yang tidak beres"
      description="Halaman gagal dimuat karena kesalahan di sisi kami. Coba muat ulang; kalau masih gagal, kembali ke beranda."
      scene={<Burst />}
      actions={
        <>
          <button type="button" onClick={() => reset()} className={bsPrimary}>
            <IconRefresh />
            Coba lagi
          </button>
          <Link href="/" className={bsGhost}>
            <IconHome />
            Beranda
          </Link>
        </>
      }
      note={error.digest ? `ref: ${error.digest}` : undefined}
    />
  );
}
