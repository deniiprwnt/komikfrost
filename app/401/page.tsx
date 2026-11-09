import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome, IconKey } from "@/components/bare-screen";
import { Checkpoint } from "@/components/scene-props";

export const metadata: Metadata = { title: "401 · Perlu masuk" };

/** 401 — belum terautentikasi (sesi gate hilang/kedaluwarsa). Arahkan ke sini dari middleware bila perlu. */
export default function UnauthorizedPage() {
  return (
    <StatusScreen
      code="401"
      tone="violet"
      mood="guard"
      label="Perlu masuk"
      jp="認証が必要です"
      sfx={{ jp: "ピッ！", romaji: "pi!" }}
      bubble="Kartu identitasnya mana?"
      title="Tunjukkan kartumu dulu"
      description="Halaman ini hanya untuk yang sudah masuk. Sesimu belum ada atau sudah kedaluwarsa — masuk dengan kata sandi, lalu kamu langsung kembali ke sini."
      scene={<Checkpoint />}
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
