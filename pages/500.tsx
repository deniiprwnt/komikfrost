import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome, IconRefresh } from "@/components/bare-screen";
import { Burst } from "@/components/scene-props";

/**
 * 500 statis untuk Pages Router.
 *
 * Next.js memakai `pages/500` untuk menghasilkan `.next/server/pages/500.html` â€”
 * halaman fallback yang disajikan saat error terjadi di luar jangkauan error
 * boundary App Router (root layout / middleware). Tanpa file ini yang tampil
 * adalah halaman bawaan Next ("500 | Internal Server Error."). Desainnya
 * sengaja disamakan dengan app/error.tsx dan app/galat-500/page.tsx.
 */
export default function ServerError() {
  return (
    <StatusScreen
      code="500"
      tone="red"
      mood="dizzy"
      label="Terjadi kesalahan"
      jp={"\u30b5\u30fc\u30d0\u30fc\u30a8\u30e9\u30fc"}
      sfx={{ jp: "\u30dc\u30f3\u30c3\uff01", romaji: "bon!" }}
      bubble={"Ada yang korslet\u2026"}
      title="Ada yang tidak beres"
      description="Halaman gagal dimuat karena kesalahan di sisi kami. Coba muat ulang; kalau masih gagal, kembali ke beranda."
      scene={<Burst />}
      actions={
        <>
          <button type="button" onClick={() => window.location.reload()} className={bsPrimary}>
            <IconRefresh />
            Coba lagi
          </button>
          <Link href="/" className={bsGhost}>
            <IconHome />
            Beranda
          </Link>
        </>
      }
    />
  );
}
