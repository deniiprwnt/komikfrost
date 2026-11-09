import Link from "next/link";
import { StatusScreen, bsGhost, bsPrimary, IconHome } from "@/components/bare-screen";
import { MissingPages } from "@/components/scene-props";

/** 404 — URL tidak cocok route mana pun. Layar penuh, tanpa chrome. */
export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      tone="blue"
      mood="lost"
      label="Halaman tidak ditemukan"
      jp="ページが見つかりません"
      sfx={{ jp: "キョロキョロ", romaji: "kyoro kyoro" }}
      bubble="Lho… halamannya mana?"
      title="Chapter ini hilang dari rak"
      description="Alamatnya salah ketik atau halamannya sudah dipindahkan. Balik ke beranda dan temukan bacaanmu dari sana."
      scene={<MissingPages />}
      actions={
        <>
          <Link href="/" className={bsPrimary}>
            <IconHome />
            Kembali ke beranda
          </Link>
          <Link href="/terbaru" className={bsGhost}>
            Lihat yang terbaru
          </Link>
        </>
      }
      links={[
        { href: "/populer", label: "Peringkat" },
        { href: "/genre", label: "Genre" },
        { href: "/favorit", label: "Favorit" },
      ]}
    />
  );
}
