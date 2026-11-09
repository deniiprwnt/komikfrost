import type { AppProps } from "next/app";
import { Archivo, Figtree } from "next/font/google";
import "../app/globals.css";

/**
 * Shell Pages Router untuk halaman 500 statis. Memuat globals.css dan font
 * yang sama dengan app/layout.tsx agar desain layar status (kelas mg-*,
 * maskot Yuki) tampil utuh.
 */
const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export default function PagesApp({ Component, pageProps }: AppProps) {
  return (
    <div className={`${display.variable} ${sans.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
