import type { GenreRef } from "./types";

/**
 * lib/api/genre-canonical.ts â€” daftar genre kanonis + tabel alias.
 *
 * Masalah yang diselesaikan: tiap sumber (Komiku, Shinigami, Komikcast)
 * memakai nama/slug genre sendiri, sehingga judul yang sama tampil dengan
 * genre berbeda di bagian berbeda ("Fantasi" di Update Terbaru vs
 * "Fantasy" di Rekomendasi). Semua varian dipetakan ke SATU bentuk
 * kanonis (Bahasa Indonesia) di lapisan agregator, jadi semua bagian
 * menampilkan genre yang sama.
 */

/** Nama genre kanonis â€” satu bahasa (Indonesia) kecuali istilah baku. */
const CANON_NAMES = [
  "Aksi",
  "Dewasa",
  "Demon",
  "Doujinshi",
  "Drama",
  "Ecchi",
  "Fantasi",
  "Gender Bender",
  "Harem",
  "Horor",
  "Isekai",
  "Josei",
  "Komedi",
  "Kuliner",
  "Martial Arts",
  "Mature",
  "Mecha",
  "Militer",
  "Misteri",
  "Monster",
  "Musik",
  "Olahraga",
  "One Shot",
  "Petualangan",
  "Psikologis",
  "Reinkarnasi",
  "Roh",
  "Romansa",
  "Sci-Fi",
  "Sejarah",
  "Seinen",
  "Sekolah",
  "Shoujo",
  "Shounen",
  "Sihir",
  "Slice of Life",
  "Smut",
  "Supernatural",
  "Swordsmanship",
  "Thriller",
  "Vampir",
  "Zombie",
] as const;

/** "Sci-Fi" â†’ "sci-fi", "Slice of Life" â†’ "slice-of-life". */
export function genreSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Daftar genre kanonis siap tampil (nama + slug). */
export const CANONICAL_GENRES: GenreRef[] = CANON_NAMES.map((name) => ({
  name,
  slug: genreSlug(name),
}));

/**
 * Kunci normalisasi untuk pencocokan: lowercase, tanpa diakritik,
 * tanda baca/hubung â†’ spasi. "One-Shot" dan "one shot" jadi kunci sama.
 */
function keyOf(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Varian (kunci ternormalisasi) â†’ nama kanonis. */
const ALIASES: Record<string, string> = {
  action: "Aksi",
  aksi: "Aksi",
  fighting: "Aksi",
  battle: "Aksi",
  adult: "Dewasa",
  dewasa: "Dewasa",
  adventure: "Petualangan",
  petualangan: "Petualangan",
  comedy: "Komedi",
  komedi: "Komedi",
  demon: "Demon",
  demons: "Demon",
  iblis: "Demon",
  drama: "Drama",
  fantasy: "Fantasi",
  fantasi: "Fantasi",
  horror: "Horor",
  horor: "Horor",
  ghost: "Roh",
  hantu: "Roh",
  isekai: "Isekai",
  josei: "Josei",
  cooking: "Kuliner",
  kuliner: "Kuliner",
  "martial art": "Martial Arts",
  "martial arts": "Martial Arts",
  mature: "Mature",
  mecha: "Mecha",
  military: "Militer",
  militer: "Militer",
  mystery: "Misteri",
  misteri: "Misteri",
  monster: "Monster",
  monsters: "Monster",
  "monster girls": "Monster",
  "monster girl": "Monster",
  music: "Musik",
  musik: "Musik",
  sport: "Olahraga",
  sports: "Olahraga",
  olahraga: "Olahraga",
  oneshot: "One Shot",
  "one shot": "One Shot",
  psychological: "Psikologis",
  psychology: "Psikologis",
  psikologis: "Psikologis",
  reincarnation: "Reinkarnasi",
  reinkarnasi: "Reinkarnasi",
  romance: "Romansa",
  romansa: "Romansa",
  romantis: "Romansa",
  scifi: "Sci-Fi",
  "sci fi": "Sci-Fi",
  history: "Sejarah",
  historical: "Sejarah",
  sejarah: "Sejarah",
  school: "Sekolah",
  "school life": "Sekolah",
  sekolah: "Sekolah",
  magic: "Sihir",
  sihir: "Sihir",
  "slice of life": "Slice of Life",
  supernatural: "Supernatural",
  supranatural: "Supernatural",
  swordsmanship: "Swordsmanship",
  swormanship: "Swordsmanship",
  thriller: "Thriller",
  vampire: "Vampir",
  vampir: "Vampir",
  zombie: "Zombie",
  "gender bender": "Gender Bender",
  doujinshi: "Doujinshi",
  ecchi: "Ecchi",
  harem: "Harem",
  shoujo: "Shoujo",
  shounen: "Shounen",
  seinen: "Seinen",
  smut: "Smut",
};

const CANON_BY_KEY = new Map(CANONICAL_GENRES.map((g) => [keyOf(g.name), g]));

/** Entri sampah yang pernah muncul di sumber (bukan genre nyata). */
const GARBAGE = new Set([
  "tess",
  "tes",
  "test",
  "dra",
  "hot",
  "apocalypse",
  "na",
  "none",
  "unknown",
  "lainnya",
]);

/** Apakah teks ini layak dianggap genre (bukan sampah / terlalu pendek)? */
function usableKey(raw?: string | null): string | null {
  const k = keyOf(raw ?? "");
  if (!k || k.length < 3) return null;
  if (GARBAGE.has(k)) return null;
  return k;
}

/**
 * Petakan satu nama/slug genre apa pun ke bentuk kanonis.
 * null = bukan genre yang dikenal (sampah, terlalu pendek, tak dikenal).
 */
export function canonicalGenre(raw?: string | null): GenreRef | null {
  const k = usableKey(raw);
  if (!k) return null;
  const aliasName = ALIASES[k];
  const hit = aliasName ? CANON_BY_KEY.get(keyOf(aliasName)) : CANON_BY_KEY.get(k);
  return hit ? { name: hit.name, slug: hit.slug } : null;
}

/** Title Case sederhana: "slice of life" â†’ "Slice of Life". */
export function titleCaseGenre(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * Nama genre untuk DITAMPILKAN pada satu judul. Genre yang dikenal â†’ nama
 * kanonis; varian tak dikenal yang masih wajar â†’ Title Case (data tidak
 * dibuang); sampah/terlalu pendek â†’ undefined.
 */
export function genreDisplayName(raw?: string | null): string | undefined {
  const c = canonicalGenre(raw);
  if (c) return c.name;
  if (!usableKey(raw)) return undefined;
  return titleCaseGenre((raw ?? "").trim());
}

/**
 * Normalisasi daftar genre (halaman /genre): gabungkan duplikat/varian,
 * buang sampah & entri tak dikenal, jumlahkan count setelah normalisasi,
 * dan samakan kapitalisasi (Title Case dari nama kanonis).
 */
export function normalizeGenreList(
  items: { name?: string; slug?: string; count?: number }[],
): GenreRef[] {
  const bySlug = new Map<string, GenreRef>();
  for (const it of items) {
    const c = canonicalGenre(it.name) ?? canonicalGenre(it.slug);
    if (!c) continue;
    const count =
      typeof it.count === "number" && Number.isFinite(it.count) ? it.count : undefined;
    const ex = bySlug.get(c.slug);
    if (ex) {
      if (count !== undefined) ex.count = (ex.count ?? 0) + count;
      continue;
    }
    bySlug.set(c.slug, { ...c, ...(count !== undefined ? { count } : {}) });
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * Kandidat slug upstream untuk satu genre (kanonis dulu, lalu alias varian).
 * Dipakai saat meminta daftar komik per genre ke sumber yang masih memakai
 * slug versinya sendiri (mis. Shinigami: "fantasy" untuk "fantasi").
 */
export function upstreamGenreSlugs(genre: string): string[] {
  const c = canonicalGenre(genre);
  const out: string[] = [];
  const push = (v: string) => {
    const s = genreSlug(v);
    if (s && !out.includes(s)) out.push(s);
  };
  if (!c) {
    push(genre);
    return out;
  }
  push(c.slug);
  for (const [k, v] of Object.entries(ALIASES)) {
    if (v === c.name) push(k);
  }
  return out;
}
