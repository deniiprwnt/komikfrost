/**
 * lib/api/search.ts — service pencarian (multi-source, berhalaman).
 * Berjalan server-side: ketiga source paralel → dedupe per halaman.
 */
import { searchMangaRemote } from "./komiku";
import { searchKomikcastRemote } from "./komikcast";
import { searchShiniRemote } from "./shinigami";
import { fetchAllSettled, mergeCards, normalizeTitle } from "./aggregator";
import { completeCards } from "./manga";
import type { MangaCard, PagedResult } from "./types";
import type { MergedMangaCard } from "./aggregator";

/** Ukuran halaman per halaman UI: 15 kartu (Komiku ±15-20/halaman upstream, Shinigami page_size 15). */
const SHINI_PAGE_SIZE = 15;

/** Batasi waktu kerja tambahan (enrich) agar respons tidak tertahan upstream.
 *  Timer dibersihkan saat kerja asli selesai - versi lama memakai
 *  Promise.race yang membiarkan timer kecil terus menumpuk di event loop. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Skor relevansi judul terhadap kata kunci (0..1).
 * - 1 = judul memuat SEMUA token kata kunci (AND) → paling relevan.
 * - di bawah itu = proporsi token yang cocok.
 * - bonus kecil bila judul diawali kata kunci (exact-prefix).
 * Murni urutan tampil — tanpa membuang hasil, tanpa fuzzy.
 */
function relevanceScore(title: string, altTitle: string | undefined, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const norm = normalizeTitle(title);
  const alt = altTitle ? normalizeTitle(altTitle) : "";
  let hits = 0;
  for (const t of tokens) {
    if (t && (norm.includes(t) || (alt && alt.includes(t)))) hits++;
  }
  let score = hits / tokens.length;
  const kw = tokens.join(" ");
  if (kw && (norm === kw || norm.startsWith(kw))) score += 0.05;
  return Math.min(1.05, score);
}

/** Urutkan hasil merge: skor relevansi desc; stabil (urutan merge dipertahankan bila seri).
 * Bila ada kartu yang memuat SEMUA token (skor 1), hanya kartu-kartu itu
 * yang ditampilkan — sisanya yang cuma cocok sebagian disembunyikan.
 * Bila tidak ada yang cocok penuh, tampilkan semua urut relevansi
 * (fallback agar tidak halaman kosong) — kartu-kartu ini ditandai
 * `exactMatch: false` ("hasil mirip"). Satu token: semua exact. */
function rankByRelevance(cards: MergedMangaCard[], keyword: string): MergedMangaCard[] {
  const tokens = normalizeTitle(keyword).split(" ").filter(Boolean);
  if (tokens.length === 0) return cards;
  const scored = cards
    .map((c, i) => ({ c, i, s: relevanceScore(c.title, c.altTitle, tokens) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  // Satu token: kartu tanpa satu pun kecocokan (skor 0) BUKAN "hasil persis".
  // Dulu semuanya ditandai exact, sehingga /cari mengira ada jawaban exact
  // dan selalu memboroskan satu probe ke halaman 2.
  if (tokens.length === 1)
    return scored.map((x) => ({ ...x.c, exactMatch: x.s > 0 }));
  if (scored.some((x) => x.s >= 1))
    return scored.filter((x) => x.s >= 1).map((x) => ({ ...x.c, exactMatch: true as const }));
  return scored.map((x) => ({ ...x.c, exactMatch: false as const }));
}

/**
 * Cari komik di ketiga source, gabung + dedupe per halaman
 * (satu judul = satu item), lalu urutkan berdasar relevansi kata kunci.
 * Tiap source di-fetch sesuai halaman UI:
 * Komiku ±15-20/halaman (pola /page/N/), Shinigami 15/halaman (?page=).
 * Tampil 15 kartu per halaman UI (gabungan dipotong di sini).
 * hasNextPage = salah satu source masih punya halaman berikut.
 * Hasil yang sinopsisnya kosong (judul murni Komiku — HTML search
 * Komiku tidak memuat sinopsis) di-enrich dari halaman detailnya:
 * paralel, max 15, gagal = biarin kosong (tetap tampil).
 */
export async function searchManga(
  keyword: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  const kw = keyword.trim();
  if (!kw) return { items: [], hasNextPage: false };
  const p = Math.max(1, page);
  // Komikcast hanya di-fetch pada halaman 1: API search-nya tidak punya meta
  // paginator dan terbukti mengulang item yang sama di page>1 (page 1 = page 2
  // untuk query sempit) — fetch lanjutan cuma menambah duplikat lintas-halaman
  // + 1 upstream sia-sia. Shinigami + Komiku (pagination nyata) tetap jalan.
  const { data } = await fetchAllSettled(
    {
      komiku: () => searchMangaRemote(kw, p),
      shinigami: () => searchShiniRemote(kw, p, SHINI_PAGE_SIZE),
      ...(p === 1 ? { komikcast: () => searchKomikcastRemote(kw, p) } : {}),
    },
    "search",
  );
  const merged = mergeCards({
    komiku: data.komiku?.items ?? [],
    shinigami: data.shinigami?.items ?? [],
    komikcast: data.komikcast?.items ?? [],
  });
  // Relevansi: judul yang memuat SEMUA token kata kunci naik ke atas;
  // yang cuma cocok sebagian tenggelam. Tanpa membuang hasil.
  const ranked = rankByRelevance(merged, kw);
  // hasNextPage hanya boleh dari paginator sumber: panjang gabungan tiga
  // sumber hampir selalu > 15 walau ini halaman terakhir, sehingga tombol
  // halaman berikut muncul lalu menampilkan halaman kosong. Bila tidak ada
  // sumber yang punya halaman berikut, semua hasil relevan dikembalikan.
  const more = Boolean(
    data.komiku?.hasNextPage || data.shinigami?.hasNextPage || data.komikcast?.hasNextPage,
  );
  // 15 kartu per halaman UI — potong dulu baru perkaya agar enrich detail
  // hanya mengejar kartu yang benar-benar tampil (lebih hemat upstream).
  // Jumlah hasil gabungan SEBELUM dipotong ke ukuran halaman â€” UI memakai
  // ini untuk menampilkan "N hasil" (dulu jumlah tidak pernah dikirim).
  const total = ranked.length;
  const items = more ? ranked.slice(0, 15) : ranked;
  // Lengkapi genre/sinopsis dengan ATURAN YANG SAMA seperti beranda & detail
  // (completeCards): genre = genres[0] sumber prioritas tertinggi (bukan
  // Tema), sinopsis dipilih berdasarkan kualitas dengan fallback lintas
  // sumber lewat normalizeTitle. Dibatasi waktunya agar satu detail yang
  // lambat tidak menahan respons; kartu tetap tampil dengan data daftar.
  await withTimeout(completeCards(items), 2500);
  return { items, hasNextPage: more, total };
}
