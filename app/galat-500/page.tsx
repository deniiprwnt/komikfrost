import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome } from "@/components/bare-screen";
import { Burst } from "@/components/scene-props";

export const metadata: Metadata = { title: "500 · Terjadi kesalahan" };

/**
 * 500 — halaman statis yang sama dengan app/error.tsx, untuk pratinjau desain.
 *
 * Sengaja BUKAN route /500: Next memakai kunci path "/500" untuk export
 * 500.html bawaan, dan route app di /500 membuat langkah rename build gagal
 * (ENOENT .next/export/500.html). URL /500 tetap dilayani lewat rewrite di
 * next.config.ts.
 */
export default function ServerErrorPage() {
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
          <Link href="/" className={bsPrimary}>
            <IconHome />
            Ke beranda
          </Link>
          <Link href="/terbaru" className={bsGhost}>
            Lihat yang terbaru
          </Link>
        </>
      }
    />
  );
}
