import type { ComicSourceId, GenreRef, MangaCard } from "./types";
import { DATA_VERSION } from "./cache";

/**
 * Record KANONIS per judul â€” satu sumber kebenaran untuk genre, tipe,
 * rating, sampul, dan sinopsis yang ditampilkan di SELURUH bagian situs.
 *
 * Ditulis HANYA oleh mergeDetails (hasil merge penuh tiga sumber dengan
 * prioritas tetap Shinigami > Komiku > Komikcast). Kartu daftar (mergeCards)
 * MEMBACA record ini bila sudah ada, sehingga beranda, peringkat,
 * rekomendasi, pencarian, dan halaman detail menampilkan nilai yang sama.
 *
 * Tidak ada "siapa cepat dia menang": nilai ditentukan oleh aturan prioritas
 * sumber yang deterministik, bukan oleh request mana yang selesai lebih dulu.
 */
export interface CanonicalRecord {
  genre?: string;
  type?: string;
  genres: GenreRef[];
  rating?: string;
  ageLimit?: string;
  cover?: string;
  coverCandidates?: string[];
  synopsis?: string;
  sources: ComicSourceId[];
  at: number;
}

const MAX = 5000;
const store = new Map<string, { v: string; rec: CanonicalRecord }>();

function memKey(k: string): string {
  return `${DATA_VERSION}:${k}`;
}

/**
 * Simpan record kanonis. Record dengan cakupan sumber LEBIH BANYAK lebih
 * dipercaya (hasil merge penuh tidak boleh ditimpa hasil yang kebetulan
 * hanya mendapat satu sumber). Bila cakupan sama, record terbaru menang.
 */
export function putCanonicalRecord(k: string, rec: Omit<CanonicalRecord, "at">): void {
  if (!k) return;
  const key = memKey(k);
  const next: CanonicalRecord = { ...rec, at: Date.now() };
  const prev = store.get(key);
  if (prev) {
    if (prev.rec.sources.length > next.sources.length) return;
    if (prev.rec.sources.length === next.sources.length && prev.rec.at > next.at) return;
    store.delete(key);
  } else if (store.size >= MAX) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { v: DATA_VERSION, rec: next });
}

/** Ambil record kanonis (undefined bila belum pernah di-merge sebagai detail). */
export function getCanonicalRecord(k: string): CanonicalRecord | undefined {
  if (!k) return undefined;
  const hit = store.get(memKey(k));
  return hit && hit.v === DATA_VERSION ? hit.rec : undefined;
}

/**
 * Tempel nilai record kanonis ke sebuah kartu yang SUDAH di-merge.
 * Dipakai setelah tahap enrich (Komikcast/Komiku) yang berjalan pasca-merge:
 * enrich hanya boleh MELENGKAPI kartu yang belum punya record kanonis, tidak
 * boleh menimpa genre/tipe/sinopsis/sampul yang sudah ditetapkan detail.
 * Mengembalikan kartu yang sama (diubah di tempat) agar hemat alokasi.
 */
export function applyCanonicalCard<C extends MangaCard>(card: C, key: string): C {
  const rec = getCanonicalRecord(key);
  if (!rec) return card;
  if (rec.genre) card.genre = rec.genre;
  if (rec.type) card.type = rec.type as MangaCard["type"];
  if (rec.synopsis) card.synopsis = rec.synopsis;
  if (rec.cover) {
    card.thumbnail = rec.cover;
    if (rec.coverCandidates && rec.coverCandidates.length > 1) {
      card.thumbnailCandidates = rec.coverCandidates;
    }
  }
  return card;
}
