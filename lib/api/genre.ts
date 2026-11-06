/**
 * lib/api/genre.ts — service genre (multi-source).
 * Daftar genre dari Komiku (stabil) + Shinigami (tambal yang belum ada);
 * isi per genre digabung lalu dedupe.
 */
import { fetchGenres, fetchMangaByGenre } from "./komiku";
import { fetchShiniGenres, fetchShiniLatest } from "./shinigami";
import { fetchAllSettled, mergeCards, normalizeTitle } from "./aggregator";
import type { GenreRef, PagedResult, MangaCard } from "./types";

/** Daftar semua genre (Komiku utama; Shinigami menambal yang belum ada). */
export async function getGenres(): Promise<GenreRef[]> {
  const { data } = await fetchAllSettled(
    {
      komiku: () => fetchGenres(),
      shinigami: () => fetchShiniGenres(),
    },
    "genres",
  );
  const seen = new Set<string>();
  const out: GenreRef[] = [];
  for (const g of [...(data.komiku ?? []), ...(data.shinigami ?? [])]) {
    const key = (g.slug || g.name).toLowerCase();
    if (!g.slug || !g.name || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Komik berdasarkan genre, berhalaman (gabungan unik dua source). */
export async function getMangaByGenre(
  genre: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  const { data } = await fetchAllSettled(
    {
      komiku: () => fetchMangaByGenre(genre, page),
      shinigami: () => fetchShiniLatest(page, { genre, pageSize: 15 }),
    },
    "genre",
  );
  const ku = data.komiku;
  const sh = data.shinigami;
  // 15 kartu per halaman UI — gabungan dua source dipotong di sini.
  const merged = mergeCards({ komiku: ku?.items ?? [], shinigami: sh?.items ?? [] });
  // hasNextPage HANYA dari paginator sumber. Panjang gabungan dua sumber
  // hampir selalu > 15 walau ini halaman terakhir, sehingga tombol halaman
  // berikut muncul lalu menampilkan halaman kosong. Bila tidak ada sumber
  // yang punya halaman berikut, semua kartu dikembalikan (tanpa potong).
  const more = Boolean(ku?.hasNextPage || sh?.hasNextPage);
  return { items: more ? merged.slice(0, 15) : merged, hasNextPage: more };
}

/** Samakan slug genre → entri daftar (nama sama, case-insensitive). */
export async function resolveGenreSlug(slug: string): Promise<string> {
  const s = slug.toLowerCase();
  try {
    const genres = await getGenres();
    const hit = genres.find((g) => g.slug.toLowerCase() === s || normalizeTitle(g.name) === normalizeTitle(s));
    return hit ? hit.slug : slug;
  } catch {
    return slug;
  }
}
