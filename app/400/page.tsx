import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome } from "@/components/bare-screen";

export const metadata: Metadata = { title: "400 · Permintaan tidak valid" };

/** 400 — permintaan tidak valid (alamat/parameter rusak). Arahkan ke sini dari middleware bila perlu. */
export default function BadRequestPage() {
  return (
    <StatusScreen
      code="400"
      tone="teal"
      mood="puzzled"
      label="Permintaan tidak valid"
      sfx={{ jp: "クシャッ", romaji: "kusha" }}
      bubble="Hah? Aku nggak ngerti maksudnya…"
      title="Permintaan ini membingungkan"
      description="Server tidak bisa memahami permintaanmu — alamat atau datanya kemungkinan rusak. Periksa lagi tautannya, atau mulai dari beranda."
      actions={
        <>
          <Link href="/" className={bsPrimary}>
            <IconHome />
            Ke beranda
          </Link>
          <Link href="/cari" className={bsGhost}>
            Cari komik
          </Link>
        </>
      }
    />
  );
}
