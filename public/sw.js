/* Service worker KomikFrost.
 *
 * Prinsip (situs ini di balik gerbang password):
 * - Halaman & /api/* TIDAK PERNAH di-cache. Data komik live dari Komiku,
 *   dan halaman terautentikasi tidak boleh tertinggal di disk.
 * - Aset build Next (/_next/static, nama file ber-hash = immutable) dan
 *   ikon/manifest di-cache agar shell aplikasi bisa dibuka saat offline.
 * - Navigasi: network-first, jatuh ke /offline.html bila jaringan mati.
 */

const VERSION = "v2";
const STATIC_CACHE = `kf-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Manifest sengaja TIDAK di-precache dan TIDAK di-cache-first: isinya
// bisa berubah antar-deploy (ikon, shortcut), dan cache-first akan
// menyembunyikan perubahan itu selamanya. Biarkan browser HTTP cache
// yang menanganinya (header revalidate diatur next.config.ts).
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll() gagal total bila satu URL 404 — tambahkan satu per satu
      // supaya satu ikon hilang tidak membatalkan seluruh instalasi.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      // Sengaja TIDAK skipWaiting: versi baru menunggu user menekan
      // "Muat ulang" agar halaman yang sedang dibaca tidak putus.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isStaticAsset = (pathname) =>
  pathname.startsWith("/_next/static/") ||
  pathname.startsWith("/icons/") ||
  pathname === "/apple-touch-icon.png" ||
  pathname === "/offline.html";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Lintas origin (CDN gambar Komiku) — biarkan browser/jaringan.
  if (url.origin !== self.location.origin) return;
  // API: selalu jaringan, jangan pernah disentuh cache.
  if (url.pathname.startsWith("/api/")) return;

  // Navigasi halaman: network-first + fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response("Kamu sedang offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Aset statis: cache-first (nama file ber-hash tidak akan berubah).
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Hanya 200 penuh yang boleh masuk Cache Storage — `cache.put`
        // melempar untuk respons 206 (partial). `res.ok` (200–299)
        // terlalu longgar untuk cek ini.
        if (res && res.status === 200 && res.type === "basic") {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })(),
    );
  }
});
