/* Service worker KomikFrost.
 *
 * Prinsip (situs ini di balik gerbang password):
 * - Halaman & /api/* TIDAK PERNAH di-cache. Data komik live dari Komiku,
 *   dan halaman terautentikasi tidak boleh tertinggal di disk.
 * - Aset build Next (/_next/static, nama file ber-hash = immutable) dan
 *   ikon/manifest di-cache agar shell aplikasi bisa dibuka saat offline.
 * - Navigasi: network-first, jatuh ke /offline.html bila jaringan mati.
 */

const VERSION = "v14";
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

// Dev (localhost): jangan sentuh /_next/* sama sekali. Nama chunk di dev
// TIDAK ber-hash, jadi cache-first menyajikan bundel basi — export baru
// (mis. <Sidebar />) belum ada di chunk lama sehingga React melempar
// "Element type is invalid. Received a promise that resolves to undefined".
// Dev = localhost/loopback ATAU IP privat (LAN) — nama chunk Next dev tidak
// ber-hash, cache-first menyajikan bundel basi. Port sengaja TIDAK dipakai
// sebagai penanda: self-hosting produksi di port non-standar tetap harus
// menyimpan cache.
const isDevHost = (() => {
  const h = self.location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  return false;
})();

// Ambil /offline.html terbaru dari jaringan (lewati HTTP cache) lalu simpan.
// `allCaches` = tulis juga ke cache versi lama milik SW yang masih aktif.
let offlineCheckedAt = 0;
async function refreshOfflinePage(allCaches) {
  try {
    const res = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
    if (!res || res.status !== 200) return;
    const names = new Set([STATIC_CACHE]);
    if (allCaches) {
      for (const k of await caches.keys()) {
        if (k.startsWith("kf-static-")) names.add(k);
      }
    }
    await Promise.all(
      [...names].map(async (k) => (await caches.open(k)).put(OFFLINE_URL, res.clone())),
    );
  } catch {
    // Offline / gagal: biarkan salinan yang sudah ada.
  }
}

// Setelah navigasi online yang berhasil, periksa ulang halaman offline
// (maks. sekali per 6 jam) supaya perubahan desainnya tidak tertinggal.
function maybeRefreshOfflinePage() {
  const now = Date.now();
  if (now - offlineCheckedAt < 6 * 60 * 60 * 1000) return Promise.resolve();
  offlineCheckedAt = now;
  return refreshOfflinePage(false);
}

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
      // Segarkan /offline.html di SEMUA cache kf-static-* yang sudah ada.
      // SW lama masih memegang kendali sampai user menekan "Muat ulang";
      // tanpa ini ia terus menyajikan halaman offline versi lama dari
      // cache-nya sendiri meski halaman barunya sudah ter-deploy.
      await refreshOfflinePage(true);
      // Sengaja TIDAK skipWaiting: versi baru menunggu user menekan
      // "Muat ulang" agar halaman yang sedang dibaca tidak putus.
      // Pengecualian dev: SW harus langsung aktif agar chunk dev basi
      // (penyebab "promise that resolves to undefined") segera terbuang.
      if (isDevHost) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Buang cache versi lama (di dev maupun produksi).
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
      );
      // Dev: buang chunk /_next/ basi, tapi pertahankan /offline.html & ikon —
      // menghapus seluruh cache membuat fallback offline hilang (jadi teks polos).
      if (isDevHost) {
        const cache = await caches.open(STATIC_CACHE);
        for (const r of await cache.keys()) {
          if (new URL(r.url).pathname.startsWith("/_next/")) await cache.delete(r);
        }
      }
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
  // Dev: aset Next tidak di-cache (lihat isDevHost).
  if (isDevHost && url.pathname.startsWith("/_next/")) return;
  // API: selalu jaringan, jangan pernah disentuh cache.
  if (url.pathname.startsWith("/api/")) return;

  // Navigasi halaman: network-first + fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          try {
            event.waitUntil(maybeRefreshOfflinePage());
          } catch {
            // waitUntil tak boleh membuat navigasi online gagal.
          }
          return res;
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
