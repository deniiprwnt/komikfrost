import { Html, Head, Main, NextScript } from "next/document";

/**
 * Dokumen Pages Router â€” HANYA dipakai halaman fallback framework
 * (pages/500.tsx), bukan oleh App Router. Tema gelap dipasang langsung di
 * <html> supaya variabel warna `html.dark` di globals.css berlaku.
 */
export default function Document() {
  return (
    <Html lang="id" className="dark">
      <Head />
      <body className="bg-ink font-sans text-fg-dark antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
