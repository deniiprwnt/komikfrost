"use client";

import "./globals.css";
import { StatusScreen, bsGhost, bsPrimary, IconRefresh } from "@/components/bare-screen";
import { Cracks } from "@/components/scene-props";

/** Error di root layout itu sendiri — harus menyertakan <html>/<body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-ink font-sans text-fg-dark antialiased">
        <StatusScreen
          shock
          code="500"
          tone="red"
          mood="faint"
          label="Kesalahan fatal"
          jp="致命的なエラー"
          sfx={{ jp: "ガシャーン", romaji: "gashaan" }}
          bubble="…………"
          title="Aplikasi gagal dimuat"
          description="Terjadi kesalahan serius saat menyiapkan aplikasi. Muat ulang untuk mencoba lagi."
          scene={<Cracks />}
          actions={
            <>
              <button type="button" onClick={() => reset()} className={bsPrimary}>
                <IconRefresh />
                Muat ulang
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={bsGhost}>
                Beranda
              </a>
            </>
          }
          note={error.digest ? `ref: ${error.digest}` : undefined}
        />
      </body>
    </html>
  );
}
