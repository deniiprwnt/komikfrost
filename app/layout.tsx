import type { Metadata, Viewport } from "next";
import { Archivo, Figtree } from "next/font/google";
import { ThemeProvider } from "@/components/theme";
import { BootSplash } from "@/components/boot-splash";
import { RouteMemory } from "@/components/route-memory";
import { Pwa } from "@/components/pwa";
import { NoZoom } from "@/components/no-zoom";
import { BackToTop, Footer, Header, Main, MobileTabBar, Sidebar } from "@/components/layout";
import "./globals.css";

// Halaman bersifat statis (shell dari CDN) — data komik tetap live karena
// semua halaman fetch client-side via apiGet/apiGetSWR setelah mount.
// API route (/api/*) tetap dinamis via force-dynamic masing-masing.

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

export const metadata: Metadata = {
  title: "KomikFrost: Baca Manga, Manhwa & Manhua Bahasa Indonesia",
  description:
    "Platform baca komik online: manga, manhwa, dan manhua terbaru dalam Bahasa Indonesia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KomikFrost",
    // iOS 26+: status bar selalu transparan di atas konten — nilai yang
    // berlaku adalah black-translucent (teks putih); "black" diabaikan.
    // Default gelap (tema default aplikasi); ThemeProvider memperbarui
    // meta ini setiap tema diganti agar bar iOS ikut terang/gelap.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Situs pribadi — jangan dirayapi / ditampilkan mesin pencari.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

// viewport-fit=cover diperlukan agar env(safe-area-inset-bottom) terbaca
// di iPhone bertakik/notch — dipakai oleh .pb-safe pada tab bar mobile.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom dikunci agar terasa seperti aplikasi native.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Satu nilai default gelap (tema default aplikasi). Nilai media-query
  // dihapus — yang berlaku adalah meta theme-color yang ditulis ulang
  // ThemeProvider setiap tema diganti, agar bar browser/PWA selalu sama
  // dengan tema aplikasi, bukan tema OS.
  themeColor: "#080e11",
};

/**
 * Deteksi platform SEBELUM paint → <html data-platform="ios|android|desktop">.
 * CSS (globals.css) memakai atribut ini untuk menukar skala rounded.
 * Pratinjau di desktop: buka /?platform=ios, /?platform=android atau
 * /?platform=desktop (disimpan); /?platform=auto menghapus pilihan.
 */
const PLATFORM_SCRIPT =
  'try{var d=document.documentElement,u=navigator.userAgent,s=null,m=location.search.match(/[?&]platform=(ios|android|desktop|auto)/);' +
  'try{if(m){if(m[1]==="auto")localStorage.removeItem("bk-platform");else localStorage.setItem("bk-platform",m[1])}s=localStorage.getItem("bk-platform")}catch(e){}' +
  'var k=s||((/iPhone|iPad|iPod/.test(u)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1))?"ios":/Android/i.test(u)?"android":"desktop");' +
  'd.dataset.platform=k}catch(e){}';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* Tema diterapkan SEBELUM paint: tanpa ini konten sempat tampil
            terang sekejap lalu berubah gelap (default aplikasi = gelap).
            Skrip kecil & inline agar tidak menambah request. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var p=!!(matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches||navigator.standalone);if(p)document.documentElement.classList.add("booting");var t=localStorage.getItem("bk-theme");document.documentElement.classList.toggle("dark",t!=="light");var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content",p||t!=="light"?"#080e11":"#eaf1f1")}catch(e){document.documentElement.classList.add("dark")}try{var r=localStorage.getItem("bk-sidebar")==="1"}catch(e){var r=false}document.documentElement.dataset.sidebar=(r||innerWidth<1200||location.pathname.indexOf("/baca/")===0)?"rail":"full";',
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: PLATFORM_SCRIPT }} />
        {/* CDN gambar disambungkan lebih awal agar handshake TLS/DNS
            tidak menunggu gambar pertama. Gambar chapter tersebar di
            beberapa subdomain (image2..image8), cover dari thumbnail, dan
            host lain (Shinigami/Komikcast) yang diproxy lewat origin ini. */}
        <link rel="preconnect" href="https://img.komiku.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://thumbnail.komiku.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.komiku.org" />
        <link rel="dns-prefetch" href="https://image2.komiku.to" />
        <link rel="dns-prefetch" href="https://image3.komiku.to" />
        <link rel="dns-prefetch" href="https://image4.komiku.to" />
        <link rel="dns-prefetch" href="https://image5.komiku.to" />
        <link rel="dns-prefetch" href="https://image6.komiku.to" />
        <link rel="dns-prefetch" href="https://image7.komiku.to" />
        <link rel="dns-prefetch" href="https://image8.komiku.to" />
        <link rel="dns-prefetch" href="https://assets.shngm.id" />
        <link rel="dns-prefetch" href="https://cdn.komikcast.top" />
        {/* Standar modern untuk mode standalone (Chrome/Edge/Android).
            Metadata appleWebApp hanya menghasilkan varian apple-*. */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-hidden bg-paper font-sans text-fg antialiased dark:bg-ink dark:text-fg-dark">
        <ThemeProvider>
          <BootSplash />
          <RouteMemory />
          <Pwa />
          <NoZoom />
          <Sidebar />
          <div className="app-shell flex min-w-0 flex-1 flex-col">
            <Header />
            <Main>{children}</Main>
            <Footer />
          </div>
          <MobileTabBar />
          <BackToTop />
        </ThemeProvider>
      </body>
    </html>
  );
}
