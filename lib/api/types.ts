/**
 * Tipe data berdasarkan struktur markup aktual dari Komiku.org.
 * Lihat docs/API-KOMIKU.md untuk dokumentasi endpoint & field.
 * Field yang tidak disediakan Komiku TIDAK dibuat-buat (opsional / hilang).
 */

/** Tipe komik: Manga (JP) | Manhwa (KR) | Manhua (CN) */
export type KomikType = "Manga" | "Manhwa" | "Manhua";

/** ID source komik yang dikenal. Disatukan di sini agar types client aman diimpor. */
export type ComicSourceId = "komiku" | "shinigami" | "komikcast";

/** Satu kartu komik dari daftar (`.bge` / `article.ls2` / search). */
export interface MangaCard {
  /** slug dari URL /manga/<slug>/ */
  slug: string;
  title: string;
  /** Judul alternatif (EN) bila upstream menyediakannya — dipakai kunci dedupe. */
  altTitle?: string;
  /** URL absolut thumbnail (thumbnail.komiku.to / thumbnail.komiku.org) */
  thumbnail: string;
  /**
   * Kandidat thumbnail lintas sumber (sumber prioritas dulu, sudah dedupe).
   * Klien mencoba berurutan bila thumbnail utama gagal dimuat â€” kotak
   * "Cover tidak tersedia" baru muncul setelah SEMUA kandidat gagal.
   */
  thumbnailCandidates?: string[];
  /** Tipe komik; absen bila sumber tidak menyebutkannya */
  type?: KomikType;
  /** Genre utama / tema (teks bebas dari Komiku, mis. "Fantasi") */
  genre?: string;
  /** Info waktu update, mis. "2 jam lalu" */
  updatedAt?: string;
  /**
   * Waktu update ABSOLUT (epoch ms). `updatedAt` adalah label relatif yang
   * dibekukan saat scrape; klien menghitung ulang labelnya dari field ini
   * setiap menit supaya "3 menit lalu" tidak berhenti di angka 3.
   * Opsional agar respons lama tetap valid.
   */
  updatedAtTs?: number;
  /** Sinopsis singkat (hanya di fragment api.komiku.org/manga/) */
  synopsis?: string;
  /** Chapter pertama: { label, url } — url = path Komiku mis. /one-piece-chapter-1/ */
  firstChapter?: ChapterRef;
  /** Chapter terbaru: { label, url } */
  latestChapter?: ChapterRef;
  /**
   * Source penyedia latestChapter di atas — terisi pada respons gabungan.
   * Dipakai badge sumber di tombol Terbaru. Opsional (respons lama valid).
   */
  latestSource?: ComicSourceId;
  /** Jumlah views (hanya ranking) */
  views?: string;
  /** Peringkat (hanya ranking) */
  rank?: number;
  /**
   * Source penyedia kartu ini — hanya terisi pada respons gabungan
   * multi-source (lihat lib/api/aggregator.ts). Opsional agar respons
   * lama tetap valid tanpa perubahan.
   */
  sources?: ComicSourceId[];
  /**
   * Hasil pencarian: true bila judul memuat SEMUA token kata kunci.
   * False/undefined = "hasil mirip" (fallback saat tak ada yang cocok
   * penuh). Opsional agar respons lama tetap valid.
   */
  exactMatch?: boolean;
  /** Slug di tiap source (untuk fetch detail per source). */
  sourceSlug?: Partial<Record<ComicSourceId, string>>;
}

/** Referensi singkat chapter (label + path URL Komiku). */
export interface ChapterRef {
  label: string;
  /** path absolut Komiku, mis. "/blue-lock-chapter-360/" */
  url: string;
}

/** Detail satu komik dari halaman /manga/<slug>/. */
export interface MangaDetail {
  slug: string;
  title: string;
  altTitle?: string;
  /** URL absolut cover (sumber prioritas tertinggi yang punya cover) */
  cover: string;
  /** Kandidat cover lintas sumber (prioritas dulu) â€” fallback onError di klien. */
  coverCandidates?: string[];
  synopsis: string;
  type?: string;
  theme?: string;
  genres: GenreRef[];
  author?: string;
  status?: string;
  rating?: string;
  /**
   * Batas usia konten (mis. "17+"), dipisah dari `rating` (skor 0-10).
   * Sumber mencampur keduanya di satu kolom; lihat lib/api/rating.ts.
   */
  ageLimit?: string;
  readingDirection?: string;
  firstChapter?: ChapterRef;
  latestChapter?: ChapterRef;
  /** Daftar chapter lengkap (terbaru dulu), dari tabel #Daftar_Chapter */
  chapters: ChapterItem[];
  /**
   * Source penyedia detail ini — hanya terisi pada respons gabungan
   * (lihat lib/api/aggregator.ts). Opsional agar respons lama valid.
   */
  sources?: ComicSourceId[];
  /** Slug di tiap source (untuk fetch detail per source). */
  sourceSlug?: Partial<Record<ComicSourceId, string>>;
}

/** Satu baris chapter di daftar chapter. */
export interface ChapterItem {
  /** label mis. "Chapter 360" */
  title: string;
  /** path chapter source utama mis. "/blue-lock-chapter-360/" */
  url: string;
  /** tanggal rilis "14/09/2026" — absen bila tidak ada */
  date?: string;
  /**
   * ID chapter native (hanya Shinigami: chapter_id) — opsional, non-breaking.
   * Dipakai reader untuk langsung fetch chapter/detail tanpa me-list ulang.
   */
  chapterId?: string;
  /**
   * Source penyedia chapter ini — hanya terisi pada respons gabungan.
   * Entri pertama = source utama (Shinigami bila nomor tersedia di sana,
   * Komiku hanya bila nomor tersebut tidak ada di Shinigami).
   */
  sources?: { source: ComicSourceId; url: string }[];
}

/** Satu genre dari /p/daftar-genre/. */
export interface GenreRef {
  /** nama tampilan, mis. "Action" */
  name: string;
  /** slug untuk /genre/<slug>/, mis. "action" */
  slug: string;
  /** jumlah judul — hanya ada di halaman daftar genre */
  count?: number;
}

/** Isi satu chapter dari halaman reader. */
export interface ChapterData {
  /** judul halaman, mis. "Blue Lock Chapter 360" */
  title: string;
  /** slug komik induk */
  mangaSlug: string;
  /** label chapter saat ini, mis. "Chapter 360" */
  chapterLabel: string;
  /** URL absolut gambar halaman (berurutan), tanpa gambar promosi */
  images: string[];
  /** path chapter sebelumnya (relatif Komiku) — absen bila tidak ada */
  prevUrl?: string;
  /** path chapter berikutnya — Komiku hanya menyediakan tombol Prev */
  nextUrl?: string;
  /** path halaman detail komik, mis. "/manga/blue-lock/" */
  mangaUrl: string;
}

/** Hasil list berhalaman dari fragment api.komiku.org. */
export interface PagedResult<T> {
  items: T[];
  /** false bila tidak ada halaman berikut (deteksi dari span hx-get page/N) */
  hasNextPage: boolean;
  /**
   * Jumlah hasil gabungan untuk halaman ini (sebelum dipotong ke ukuran
   * halaman UI). Dipakai UI untuk menampilkan "N hasil". Opsional agar
   * respons lama tetap valid.
   */
  total?: number;
}

/** Error terstruktur dari lapisan API (diteruskan ke UI sebagai error state). */
export interface ApiError {
  message: string;
  /** endpoint/source Komiku yang gagal */
  source: string;
  status?: number;
}
