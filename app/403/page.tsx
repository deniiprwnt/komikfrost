import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome, IconKey } from "@/components/bare-screen";
import { Padlock } from "@/components/scene-props";

export const metadata: Metadata = { title: "403 · Akses ditolak" };

/** 403 — akses ditolak. Arahkan ke sini (redirect/rewrite) dari gate bila perlu. */
export default function ForbiddenPage() {
  return (
    <StatusScreen
      code="403"
      tone="amber"
      mood="stern"
      label="Akses ditolak"
      jp="アクセスできません"
      sfx={{ jp: "ドンッ！", romaji: "don!" }}
      bubble="Stop! Khusus pemegang kunci."
      title="Area ini terkunci"
      description="Kamu tidak punya izin untuk membuka halaman ini. Masuk dengan kata sandi yang benar, atau kembali ke beranda."
      scene={<Padlock />}
      actions={
        <>
          <Link href="/masuk" className={bsPrimary}>
            <IconKey />
            Masuk
          </Link>
          <Link href="/" className={bsGhost}>
            <IconHome />
            Beranda
          </Link>
        </>
      }
    />
  );
}
