import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // `next dev` dan `next build` memakai `.next` yang sama secara default.
  // Menjalankan build saat dev masih aktif membuat artefak saling menimpa:
  // build gagal di "Collecting page data" dengan PageNotFoundError untuk
  // route yang sebenarnya ada. Pisahkan folder dev agar keduanya bisa jalan
  // bersamaan; build/start tetap memakai `.next` seperti biasa.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Jangan bocorkan "X-Powered-By: Next.js" ke browser.
  poweredByHeader: false,
  compress: true,
  // Proyek ini tidak memakai ESLint (tidak ada config/dependency). Tanpa flag
  // ini `next build` gagal dengan "ESLint must be installed in order to run
  // during builds" — build produksi jadi mustahil tanpa `--no-lint`.
  eslint: { ignoreDuringBuilds: true },
  compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false },
  experimental: {
    optimizePackageImports: ["cheerio"],
    // Router Cache klien — shell halaman ini semuanya komponen client yang
    // mengambil data sendiri via apiGet, jadi payload RSC yang lama tidak
    // pernah menampilkan data basi. Manfaatnya: back/forward tidak memicu
    // request RSC + skeleton baru dalam jendela ini (rasa aplikasi native).
    staleTimes: { dynamic: 300, static: 1800 },
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
