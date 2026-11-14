import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // Jangan bocorkan "X-Powered-By: Next.js" ke browser.
  poweredByHeader: false,
  compress: true,
  compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false },
  experimental: {
    optimizePackageImports: ["cheerio"],
    // P2: Router Cache klien â€” back/forward & navigasi ulang ke halaman
    // dinamis yang sama tidak refetch selama 2 menit (sejajar polling).
    staleTimes: { dynamic: 120, static: 300 },
  },
  // `/500` tidak boleh jadi route app: Next memakai path itu untuk export
  // 500.html bawaannya, dan bentrokan membuat build gagal (ENOENT rename
  // .next/export/500.html). Rewrite mempertahankan URL /500 untuk pratinjau.
  async rewrites() {
    return [{ source: "/500", destination: "/galat-500" }];
  },
  // Header hardening global (halaman + /api/* + aset statis).
  // CSP sengaja minimal (frame-ancestors saja) — script-src ketat butuh
  // nonce per-request dan akan merusak inline script Next.
  async headers() {
    return [
      // Service worker: JANGAN di-cache browser, kalau tidak pembaruan
      // aplikasi tidak akan pernah terdeteksi. Service-Worker-Allowed
      // mengizinkan scope "/" walau file berada di root public.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      // Manifest: tipe MIME benar (wajib untuk kriteria instalabilitas)
      // dan revalidasi tiap muat agar perubahan ikon/nama cepat terbaca.
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // Gambar chapter/cover dimuat langsung dari CDN Komiku (domain dinamis:
  // image2..image8.komiku.to, thumbnail.komiku.to, dll), jadi dipakai <img>
  // biasa dengan lazy loading, bukan next/image.
};

export default nextConfig;
