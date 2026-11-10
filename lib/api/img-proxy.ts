/**
 * lib/api/img-proxy.ts â€” rewrite URL gambar upstream menjadi proxy origin
 * sendiri (/api/img?u=...).
 *
 * Latar: host gambar komik (assets.shngm.id, thumbnail.komiku.*,
 * komikcast.top) sering diblokir/reset dari jaringan Indonesia â€” browser
 * me-render slot abu-abu kosong walau URL dari API valid, sementara fetch
 * server-side (jaringan luar) tetap bisa menjangkaunya. Karena itu SEMUA
 * host gambar yang dikenal diproksikan, bukan hanya Shinigami.
 */

/**
 * Host gambar upstream yang dikenal (persis). Dipakai bersama oleh
 * `proxiedImage` (rewrite di mapper) dan route /api/img (allowlist fetch
 * upstream) supaya daftar keduanya tidak pernah berbeda.
 */
export const IMG_HOSTS = new Set([
  "assets.shngm.id",
  "image2.komiku.to",
  "image3.komiku.to",
  "image4.komiku.to",
  "image5.komiku.to",
  "image6.komiku.to",
  "image7.komiku.to",
  "image8.komiku.to",
  "img.komiku.org",
  "thumbnail.komiku.to",
  "thumbnail.komiku.org",
  "cdn.komikcast.top",
  "komikcast.top",
]);

/**
 * Domain gambar upstream yang diizinkan BESERTA seluruh subdomainnya.
 *
 * Sumber memakai beberapa host gambar yang berganti-ganti (imageN.komiku.to,
 * assets.shngm.id, cdn.shngm.io, ...). Daftar host persis di atas sering
 * ketinggalan satu host baru, dan URL mentah yang tidak diproksikan berakhir
 * sebagai slot kosong di browser (host diblokir dari jaringan ID) â€” inilah
 * sebab cover seperti "Limit Breaker" tampil "Cover tidak tersedia" walau
 * ketiga sumber punya sampulnya. Dengan pencocokan sufiks, semua subdomain
 * domain yang dikenal otomatis lewat proxy.
 */
export const IMG_HOST_SUFFIXES = [
  "shngm.id",
  "shngm.io",
  "shngm.co",
  "komiku.to",
  "komiku.org",
  "komiku.com",
  "komikcast.top",
  "komikcast.app",
  "komikcast.site",
  "komikcast.io",
  "komikcast.me",
  "komikcast.com",
];

/** Apakah host ini host gambar upstream yang boleh diproksikan? */
export function isAllowedImageHost(hostname: string): boolean {
  const h = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  if (IMG_HOSTS.has(h)) return true;
  return IMG_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}

/**
 * Kembalikan URL gambar siap render di browser: host gambar yang dikenal
 * â†’ `/api/img?u=<encode>`; sisanya (kosong/relatif/host lain) diteruskan
 * apa adanya.
 *
 * URL protokol-relatif (`//host/x.jpg`) dan `http://` dinaikkan ke https
 * lebih dulu: proxy hanya boleh menembak https, dan `http:` mentah akan
 * diblokir browser sebagai mixed content pada halaman https.
 */
export function proxiedImage(url: string | undefined | null): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  let u = raw;
  if (u.startsWith("//")) u = "https:" + u;
  else if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:" && isAllowedImageHost(parsed.hostname)) {
      return `/api/img?u=${encodeURIComponent(parsed.toString())}`;
    }
  } catch {
    // Relatif / tidak valid â†’ teruskan apa adanya.
  }
  return raw;
}

/**
 * Versi daftar: rapikan + dedupe kandidat gambar (dipakai untuk rantai
 * fallback cover antar-sumber).
 */
export function proxiedImages(urls: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const v = proxiedImage(u);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}
