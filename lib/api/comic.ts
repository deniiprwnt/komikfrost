import { getMangaDetail } from "./manga";
import { cleanSynopsis } from "./text";
import type { MangaDetail } from "./types";

/**
 * getComic â€” SATU pintu data kanonis untuk satu judul.
 *
 * Semua permukaan (detail, reader, Serupa, dan resolusi judul) memakai
 * fungsi ini alih-alih merakit ulang data sendiri. Fungsi ini mendelegasikan
 * ke `getMangaDetail` yang sudah:
 *  - mengambil Shinigami â†’ Komiku â†’ Komikcast lewat `fetchAllSettled`
 *    (bukan "siapa cepat dia menang"),
 *  - memilih pemenang secara deterministik lewat `SOURCE_PRIORITY`,
 *  - menormalkan judul, genre, rating, sampul, sinopsis, dan chapter secara
 *    DETERMINISTIK dari data sumber (tanpa memori per instance).
 *
 * Lapisan ini menambahkan jaminan akhir yang idempoten pada nilai yang
 * dikembalikan (termasuk saat data berasal dari cache):
 *  - sinopsis selalu lewat `cleanSynopsis` (spasi, entity, escape, kalimat
 *    menempel) sehingga cuplikan pencarian dan halaman detail sama;
 *  - rating "0" (sumber mengisinya saat rating belum ada) dibuang agar UI
 *    menampilkan "-", bukan "0".
 */
export async function getComic(
  slug: string,
  opts: { deep?: boolean } = {},
): Promise<MangaDetail> {
  const detail = await getMangaDetail(slug, opts);
  const synopsis = cleanSynopsis(detail.synopsis) ?? "";
  const ratingRaw = detail.rating?.trim();
  const rating =
    ratingRaw && ratingRaw !== "0" && ratingRaw !== "0.0" && ratingRaw !== "0,0"
      ? ratingRaw
      : undefined;
  const out: MangaDetail = { ...detail, synopsis };
  if (rating) out.rating = rating;
  else delete (out as { rating?: string }).rating;
  return out;
}
