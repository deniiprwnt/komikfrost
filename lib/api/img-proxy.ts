/**
 * lib/api/img-proxy.ts — rewrite URL gambar upstream menjadi proxy origin
 * sendiri (/api/img?u=...).
 *
 * Latar: host gambar komik (assets.shngm.id, thumbnail.komiku.*,
 * komikcast.top) sering diblokir/reset dari jaringan Indonesia — browser
 * me-render slot abu-abu kosong walau URL dari API valid, sementara fetch
 * server-side (jaringan luar) tetap bisa menjangkaunya. Karena itu SEMUA
 * host gambar yang dikenal diproksikan, bukan hanya Shinigami.
 */

/**
 * Host gambar upstream yang dikenal. Dipakai bersama oleh `proxiedImage`
 * (rewrite di mapper) dan route /api/img (allowlist fetch upstream) supaya
 * daftar keduanya tidak pernah berbeda.
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
 * Kembalikan URL gambar siap render di browser: host gambar yang dikenal
 * (dan https) → `/api/img?u=<encode>`; sisanya (kosong/relatif/host lain)
 * diteruskan apa adanya.
 */
export function proxiedImage(url: string | undefined | null): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:" && IMG_HOSTS.has(parsed.hostname.toLowerCase())) {
      return `/api/img?u=${encodeURIComponent(u)}`;
    }
  } catch {
    // Relatif / tidak valid → teruskan apa adanya.
  }
  return u;
}
