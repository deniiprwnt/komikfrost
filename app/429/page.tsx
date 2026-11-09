import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome } from "@/components/bare-screen";
import { Cooldown } from "@/components/cooldown";
import { HeatWaves } from "@/components/scene-props";

export const metadata: Metadata = { title: "429 · Terlalu banyak permintaan" };

/** 429 — terlalu banyak permintaan (rate limit). */
export default function TooManyRequestsPage() {
  return (
    <StatusScreen
      code="429"
      tone="orange"
      mood="tired"
      label="Terlalu banyak permintaan"
      jp="リクエストが多すぎます"
      sfx={{ jp: "ゼェゼェ", romaji: "zee zee" }}
      bubble="Hah… hah… kecepatan, dong!"
      title="Pelan-pelan dulu, ya"
      description="Kamu mengirim permintaan terlalu cepat. Tunggu sekitar satu menit lalu coba lagi."
      scene={<HeatWaves />}
      extra={<Cooldown seconds={60} />}
      actions={
        <>
          <Link href="/" className={bsPrimary}>
            <IconHome />
            Ke beranda
          </Link>
          <Link href="/riwayat" className={bsGhost}>
            Buka riwayat
          </Link>
        </>
      }
    />
  );
}
