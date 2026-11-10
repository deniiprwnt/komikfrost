/**
 * lib/api/genre.ts: service genre (multi-source).
 *
 * Daftar genre: Komiku (punya jumlah) + Shinigami (tambal yang belum ada),
 * lalu DINORMALISASI ke satu daftar kanonis. Varian digabung
 * (Demon/Demons, Sport/Sports, Josei dobel, One Shot/Oneshot, ...), typo
 * diperbaiki (Supranatural jadi Supernatural, Swormanship jadi
 * Swordsmanship), entri sampah dibuang ("tess", "dra", "g", "hot"),
 * kapitalisasi disamakan, dan jumlah komik dihitung SETELAH normalisasi.
 *
 * Isi per genre: slug kanonis diterjemahkan ke slug milik tiap sumber
 * ("fantasi" jadi "fantasy" untuk Shinigami) sebelum diminta ke upstream.
 */
import { fetchGenres, fetchMangaByGenre } from "./komiku";
import { fetchShiniGenres, fetchShiniLatest } from "./shinigami";
import { fetchAllSettled, mergeCards, normalizeTitle } from "./aggregator";
import { canonicalGenre, normalizeGenreList, upstreamGenreSlugs } from "./genre-canonical";
import type { GenreRef, PagedResult, MangaCard } from "./types";

/** Daftar semua genre (kanonis, tanpa duplikat/varian/sampah). */
export async function getGenres(): Promise<GenreRef[]> {
  const { data } = await fetchAllSettled(
    {
      komiku: () => fetchGenres(),
      shinigami: () => fetchShiniGenres(),
    },
    "genres",
  );
  return normalizeGenreList([...(data.komiku ?? []), ...(data.shinigami ?? [])]);
}

/** Coba tiap varian slug upstream sampai salah satu mengembalikan item. */
async function tryEachSlug<T extends { items: MangaCard[] }>(
  slugs: string[],
  fn: (slug: string) => Promise<T>,
): Promise<T | null> {
  for (const slug of slugs) {
    try {
      const r = await fn(slug);
      if (r.items.length > 0) return r;
    } catch {
      // slug ini tidak dikenal sumber, coba varian berikutnya
    }
  }
  return null;
}

/** Komik berdasarkan genre, berhalaman (gabungan unik dua source). */
export async function getMangaByGenre(
  genre: string,
  page = 1,
): Promise<PagedResult<MangaCard>> {
  // Slug kanonis dulu, lalu alias varian milik tiap sumber
  // ("fantasi" jadi ["fantasi", "fantasy"]).
  const slugs = upstreamGenreSlugs(genre);
  const { data } = await fetchAllSettled(
    {
      komiku: async () =>
        (await tryEachSlug(slugs, (s) => fetchMangaByGenre(s, page))) ?? {
          items: [] as MangaCard[],
          hasNextPage: false,
        },
      shinigami: async () =>
        (await tryEachSlug(slugs, (s) => fetchShiniLatest(page, { genre: s, pageSize: 15 }))) ?? {
          items: [] as MangaCard[],
          hasNextPage: false,
        },
    },
    "genre",
  );
  const ku = data.komiku;
  const sh = data.shinigami;
  // 15 kartu per halaman UI, gabungan dua source dipotong di sini.
  const merged = mergeCards({ komiku: ku?.items ?? [], shinigami: sh?.items ?? [] });
  // hasNextPage HANYA dari paginator sumber. Panjang gabungan dua sumber
  // hampir selalu lebih dari 15 walau ini halaman terakhir, sehingga tombol
  // halaman berikut muncul lalu menampilkan halaman kosong. Bila tidak ada
  // sumber yang punya halaman berikut, semua kartu dikembalikan (tanpa potong).
  const more = Boolean(ku?.hasNextPage || sh?.hasNextPage);
  return { items: more ? merged.slice(0, 15) : merged, hasNextPage: more };
}

/** Samakan slug genre ke slug kanonis (bila dikenal), else slug masukan. */
export async function resolveGenreSlug(slug: string): Promise<string> {
  const s = slug.toLowerCase();
  const canon = canonicalGenre(s);
  if (canon) return canon.slug;
  try {
    const genres = await getGenres();
    const hit = genres.find(
      (g) => g.slug.toLowerCase() === s || normalizeTitle(g.name) === normalizeTitle(s),
    );
    return hit ? hit.slug : slug;
  } catch {
    return slug;
  }
}
