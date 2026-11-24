/**
 * Format jumlah views untuk tampilan: pemisah ribuan titik (gaya id-ID).
 * Menerima "9479", "37,061 views", "12.345" â†’ "9.479", "37.061", "12.345".
 * Teks yang bukan angka murni (mis. "1.2K") dikembalikan apa adanya.
 * Manual (bukan toLocaleString) agar hasil server & client identik.
 */
export function formatViews(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).replace(/\s*views?$/i, "").trim();
  if (!/^\d+$/.test(s) && !/^\d{1,3}([.,\s]\d{3})+$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
