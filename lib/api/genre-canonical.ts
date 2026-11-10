import type { GenreRef } from "./types";

/**
 * lib/api/genre-canonical.ts â€” daftar genre kanonis + tabel alias.
 *
 * Masalah yang diselesaikan: tiap sumber (Komiku, Shinigami, Komikcast)
 * memakai nama/slug genre sendiri, sehingga judul yang sama tampil dengan
 * genre berbeda di bagian berbeda ("Fantasi" di Update Terbaru vs
 * "Fantasy" di Rekomendasi). Semua varian dipetakan ke SATU bentuk
 * kanonis di lapisan agregator, jadi semua bagian menampilkan genre yang
 * sama.
 *
 * BENTUK KANONIS = BAHASA INGGRIS (Fantasy, Comedy, Action, Romance, ...).
 * Nama Indonesia tetap diterima sebagai alias masuk dan dipetakan ke bentuk
 * Inggris, sehingga data lama maupun sumber berbahasa Indonesia tidak
 * hilang â€” hanya diseragamkan.
 */

/** Nama genre kanonis â€” satu bahasa (Inggris) untuk semua bagian situs. */
const CANON_NAMES = [
  "Action",
  "Adult",
  "Adventure",
  "Comedy",
  "Cooking",
  "Demons",
  "Doujinshi",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Gender Bender",
  "Ghost",
  "Harem",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Magic",
  "Martial Arts",
  "Mature",
  "Mecha",
  "Military",
  "Mystery",
  "Monster",
  "Music",
  "One Shot",
  "Psychological",
  "Reincarnation",
  "Romance",
  "School",
  "Sci-Fi",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Slice of Life",
  "Smut",
  "Sports",
  "Supernatural",
  "Swordsmanship",
  "Thriller",
  "Vampire",
  "Zombie",
  // Genre/tema tambahan yang muncul sebagai GENRE di sumber (dan sebelumnya
  // hanya lolos sebagai teks bebas berbahasa Indonesia di kartu).
  "Coming of Age",
  "Delinquents",
  "Dungeon",
  "Family",
  "Friendship",
  "Gore",
  "Kingdom",
  "Medical",
  "Office Workers",
  "Police",
  "Prison",
  "Racing",
  "Revenge",
  "Samurai",
  "Superhero",
  "Superpower",
  "Survival",
  "Time Travel",
  "Tragedy",
  "Video Games",
  "Villainess",
  "War",
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

/**
 * Varian (kunci ternormalisasi) â†’ nama kanonis INGGRIS.
 * Sisi kiri menampung ejaan Inggris maupun Indonesia yang pernah muncul di
 * sumber (Fantasi, Komedi, Romansa, Olahraga, ...) supaya data lama tetap
 * terbaca dan tetap tampil sebagai satu genre yang sama.
 */
const ALIASES: Record<string, string> = {
  action: "Action",
  aksi: "Action",
  fighting: "Action",
  battle: "Action",
  adult: "Adult",
  dewasa: "Adult",
  adventure: "Adventure",
  petualangan: "Adventure",
  comedy: "Comedy",
  komedi: "Comedy",
  cooking: "Cooking",
  kuliner: "Cooking",
  demon: "Demons",
  demons: "Demons",
  iblis: "Demons",
  drama: "Drama",
  fantasy: "Fantasy",
  fantasi: "Fantasy",
  ghost: "Ghost",
  roh: "Ghost",
  hantu: "Ghost",
  horror: "Horror",
  horor: "Horror",
  isekai: "Isekai",
  josei: "Josei",
  magic: "Magic",
  sihir: "Magic",
  "martial art": "Martial Arts",
  "martial arts": "Martial Arts",
  mature: "Mature",
  mecha: "Mecha",
  military: "Military",
  militer: "Military",
  mystery: "Mystery",
  misteri: "Mystery",
  monster: "Monster",
  monsters: "Monster",
  "monster girl": "Monster",
  "monster girls": "Monster",
  music: "Music",
  musik: "Music",
  oneshot: "One Shot",
  "one shot": "One Shot",
  psychological: "Psychological",
  psychology: "Psychological",
  psikologis: "Psychological",
  reincarnation: "Reincarnation",
  reinkarnasi: "Reincarnation",
  romance: "Romance",
  romansa: "Romance",
  romantis: "Romance",
  scifi: "Sci-Fi",
  "sci fi": "Sci-Fi",
  history: "Historical",
  historical: "Historical",
  sejarah: "Historical",
  school: "School",
  "school life": "School",
  sekolah: "School",
  "slice of life": "Slice of Life",
  sport: "Sports",
  sports: "Sports",
  olahraga: "Sports",
  supernatural: "Supernatural",
  supranatural: "Supernatural",
  swordsmanship: "Swordsmanship",
  swormanship: "Swordsmanship",
  thriller: "Thriller",
  vampire: "Vampire",
  vampir: "Vampire",
  zombie: "Zombie",
  "gender bender": "Gender Bender",
  doujinshi: "Doujinshi",
  ecchi: "Ecchi",
  harem: "Harem",
  shoujo: "Shoujo",
  shounen: "Shounen",
  seinen: "Seinen",
  smut: "Smut",
  // Varian BAHASA INDONESIA yang datang sebagai genre/tema dari sumber.
  // Tanpa entri di sini, nilai mentahnya lolos ke UI lewat genreDisplayName
  // (Title Case) sehingga masih ada "Sekolah"/"Balas Dendam" di situs.
  "kehidupan sekolah": "School",
  "seni bela diri": "Martial Arts",
  "dunia lain": "Isekai",
  "dunia fantasi": "Fantasy",
  "dunia sihir": "Magic",
  "balas dendam": "Revenge",
  "kekuatan super": "Superpower",
  "pahlawan super": "Superhero",
  perang: "War",
  kerajaan: "Kingdom",
  keluarga: "Family",
  persahabatan: "Friendship",
  "masa muda": "Coming of Age",
  "perjalanan waktu": "Time Travel",
  "bertahan hidup": "Survival",
  tragedi: "Tragedy",
  "video game": "Video Games",
  penjara: "Prison",
  balapan: "Racing",
  "cinta segitiga": "Romance",
  "anak anak": "Family",
  "kehidupan sehari hari": "Slice of Life",
  keseharian: "Slice of Life",
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
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/**
 * Kandidat slug upstream untuk satu genre (kanonis dulu, lalu alias varian).
 * Dipakai saat meminta daftar komik per genre ke sumber yang masih memakai
 * slug versinya sendiri (mis. Komiku: "romansa" untuk "romance").
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

/**
 * Tema tambahan yang bukan genre di daftar kanonis. Sisi kiri = kunci
 * ternormalisasi (keyOf), sisi kanan = bentuk Inggris yang ditampilkan.
 * Hanya dipakai themeDisplayName; tidak menambah entri di /genre.
 */
const THEME_EXTRA: Record<string, string> = {
  "cinta segitiga": "Love Triangle",
  "keluarga kerajaan": "Royal Family",
  "sekolah menengah": "High School",
  "sekolah tinggi": "High School",
  "penjelajahan": "Exploration",
  "anak anak": "Children",
  "keseharian": "Slice of Life",
  "kehidupan sehari hari": "Slice of Life",
  "dunia game": "Video Games",
  "dunia maya": "Virtual Reality",
  "kembali ke masa lalu": "Time Travel",
  "sistem": "System",
};

/**
 * Nama TEMA untuk ditampilkan: kanonis Bahasa Inggris.
 *
 * Tema adalah field TERPISAH dari Genre (kolom "Tema" di halaman detail),
 * tetapi sumber mengisinya dengan ejaan Indonesia ("Sekolah", "Kehidupan
 * Sekolah"). Normalisasi dilakukan di sini â€” satu tempat â€” supaya komponen
 * tidak perlu tahu apa pun soal bahasa sumber.
 */
export function themeDisplayName(raw?: string | null): string | undefined {
  const base = (raw ?? "").replace(/^\s*tema\s*[:\-]\s*/i, "").trim();
  if (!base) return undefined;
  const c = canonicalGenre(base);
  if (c) return c.name;
  const k = keyOf(base);
  const extra = THEME_EXTRA[k];
  if (extra) return extra;
  if (!usableKey(base)) return undefined;
  return titleCaseGenre(base);
}
