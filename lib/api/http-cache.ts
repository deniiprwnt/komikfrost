/**
 * lib/api/http-cache.ts â€” ETag lemah + pemeriksaan If-None-Match.
 *
 * Tujuan modul ini HANYA menghemat bandwidth: respons yang byte-nya sama
 * dijawab 304 tanpa body. Modul ini TIDAK menyentuh scraping, TIDAK
 * menyimpan data, dan TIDAK mengurangi jumlah pemanggilan fungsi â€”
 * permintaan tetap sampai ke route, tetap melewati guard autentikasi +
 * rate limit di sana, dan tetap bisa memicu fetch upstream bila ETag
 * tidak cocok. Karena itu ETag tidak boleh dipakai sebagai alasan
 * memperpanjang cache data komik.
 */

/** FNV-1a 32-bit â€” cukup untuk membedakan URL gambar, BUKAN kriptografi. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * ETag lemah (`W/"â€¦"`) dari potongan string. Input sama â‡’ nilai sama,
 * sehingga browser bisa memvalidasi ulang tanpa mengunduh ulang byte.
 */
export function weakEtag(...parts: Array<string | number | undefined | null>): string {
  const raw = parts
    .filter((p) => p !== undefined && p !== null)
    .map((p) => String(p))
    .join("|");
  return `W/"${fnv1a(raw).toString(16)}-${raw.length.toString(16)}"`;
}

/**
 * Apakah klien sudah punya versi yang sama? Menangani daftar
 * `If-None-Match` (`"a", W/"b"`), nilai `*`, dan perbandingan LEMAH
 * (awalan `W/` diabaikan di kedua sisi) sesuai RFC 9110 Â§13.1.2.
 */
export function etagMatches(header: string | null | undefined, etag: string): boolean {
  const h = (header ?? "").trim();
  if (!h) return false;
  if (h === "*") return true;
  const bare = (v: string) => v.trim().replace(/^W\//i, "");
  const want = bare(etag);
  if (!want) return false;
  return h.split(",").some((c) => bare(c) === want);
}
