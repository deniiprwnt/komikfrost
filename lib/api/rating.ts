/**
 * lib/api/rating.ts â€” pisahkan SKOR dari BATAS USIA.
 *
 * Sumber menaruh dua hal berbeda di satu kolom "Rating":
 * - skor penilaian pembaca (0-10, mis. "8.7", "8,5", "8.5/10")
 * - batas usia konten ("17+", "13+", "Semua Umur", "Dewasa")
 *
 * Dulu keduanya diteruskan apa adanya ke `rating`, sehingga "17+" tampil
 * seolah skor rendah dan menimpa skor asli dari sumber prioritas. Di sini
 * keduanya dipisah: `rating` = skor saja, `ageLimit` = batas usia.
 */

export interface SplitRating {
  /** Skor 0-10 sebagai string (format titik desimal), bila ada. */
  score?: string;
  /** Batas usia, mis. "17+" / "Semua Umur". */
  ageLimit?: string;
}

const AGE_WORDS =
  /^(semua umur|all ages?|dewasa|adult|remaja|teen|anak|kids?|children)$/i;

export function splitRating(raw?: string | null): SplitRating {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return {};
  // "17+", "18 +", "13+ (Remaja)", "17+Tahun" â†’ batas usia.
  const age = s.match(/^(\d{1,2})\s*\+/);
  if (age) return { ageLimit: `${age[1]}+` };
  if (AGE_WORDS.test(s)) {
    return { ageLimit: s.replace(/\b\w/g, (c) => c.toUpperCase()) };
  }
  // Skor: "8.7", "8,5", "8.5/10", "8 / 10".
  const m = s.match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\/\s*10)?$/);
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    // Skor 0 bukan skor nyata: sumber mengisi "0" saat rating belum ada.
    // Nilai itu dibuang agar UI menampilkan "-" (tidak tersedia), bukan "0".
    if (Number.isFinite(n) && n > 0 && n <= 10) {
      return { score: m[1].replace(",", ".") };
    }
    if (n === 0) return {};
  }
  // Teks lain (mis. "- ", "N/A") tidak dianggap skor maupun batas usia.
  if (/^[-â€“â€”?]+$/.test(s) || /^n\/?a$/i.test(s)) return {};
  return { score: s };
}
