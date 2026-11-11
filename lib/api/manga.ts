/**
 * lib/api/manga.ts — service daftar & detail komik (multi-source).
 *
 * SHINIGAMI UTAMA, Komiku fallback kedua, Komikcast fallback ketiga.
 * Bentuk return & signature SAMA seperti sebelumnya (MangaCard[] /
 * MangaDetail) sehingga route /api/* dan frontend tidak perlu berubah.
 * Di dalam: fetch ketiga source paralel → mergeCards / mergeDetails
 * dengan prioritas SHINIGAMI > Komiku > Komikcast.
 */
import {
  fetchHome,
  fetchMangaDetail,
  fetchMangaList,
  fetchRanking,
  searchMangaRemote,
  type MangaListParams,
  type RankPeriod,
} from "./komiku";
import {
  fetchKomikcastBrief,
  fetchKomikcastDetail,
  fetchKomikcastLatest,
  fetchKomikcastTrending,
  resolveKomikcastBriefForTitle,
  resolveKomikcastDetailForTitle,
  type KcBrief,
} from "./komikcast";
import {
  fetchShiniLatest,
  fetchShiniMeta,
  fetchShiniRecommended,
  fetchShiniTop,
  findShiniIdByTitles,
  isShiniId,
  resolveShiniDetailForSlug,
  type ShiniFormat,
  type ShiniTopFilter,
} from "./shinigami";
import {
  aliasKeys,
  dedupeKey,
  fetchAllSettled,
  fixTitle,
  mergeCards,
  mergeDetails,
  normalizeKomikType,
  normalizeTitle,
  pickLatest,
  pickPrimaryGenre,
  pickType,
  rewriteShiniUrl,
  sortByFresh,
  SOURCE_PRIORITY,
  type MergedMangaCard,
  type MergedMangaDetail,
} from "./aggregator";
import { createKeyedCache } from "./cache";
import { isMeaningfulSynopsis, pickBestSynopsis, splitAltTitles, synopsisQuality } from "./text";
import { canonicalGenre, genreDisplayName, upstreamGenreSlugs } from "./genre-canonical";
import type { ComicSourceId, GenreRef, MangaCard, MangaDetail, PagedResult } from "./types";

/** Batas waktu kerja tambahan agar respons tidak tertahan upstream.
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
 * Coba tiap varian slug genre upstream sampai salah satu memberi hasil.
 * Daftar genre memakai bentuk kanonis (Inggris: "romance"), sedangkan
 * sumber masih punya slug sendiri (Komiku: "romansa"). Tanpa ini filter
 * Romance mengembalikan kosong walau judulnya ada.
 */
async function firstWithItems<T extends { items: MangaCard[] }>(
  slugs: string[],
  fn: (slug: string) => Promise<T>,
): Promise<T | null> {
  for (const s of slugs) {
    try {
      const r = await fn(s);
      if (r.items.length > 0) return r;
    } catch {
      // slug ini tidak dikenal sumber, coba varian berikutnya
    }
  }
  return null;
}

/**
 * Cache detail Komiku untuk melengkapi kartu (genre sebenarnya + sinopsis).
 * Isinya diturunkan murni dari upstream (bukan dari urutan request), jadi
 * cache ini hanya penghemat kerja — bukan penentu nilai. Kegagalan (null)
 * tidak disimpan agar bisa dicoba lagi.
 */
const komikuDetailCache = createKeyedCache<MangaDetail | null>(10 * 60_000, 300);
function komikuDetailSafe(slug: string): Promise<MangaDetail | null> {
  return komikuDetailCache.load(
    slug,
    async () => {
      try {
        return await fetchMangaDetail(slug);
      } catch {
        return null;
      }
    },
    (d) => d !== null,
  );
}

/* ------------------------------------------------------------------ */
/* Resolusi KANONIS tipe / genre / sinopsis (satu aturan untuk semua)    */
/* ------------------------------------------------------------------ */

/**
 * Tipe, genre utama, dan sinopsis satu judul HARUS sama di Beranda (Update
 * terbaru, Rekomendasi), Peringkat, pencarian, halaman genre, Serupa, dan
 * detail. Daftar (list) tiap sumber hanya memuat sebagian: kartu yang
 * lahir dari Komiku saja membawa label daftar yang bisa berupa TEMA
 * (mis. "Comedy"), dan kartu tanpa Shinigami tidak tahu tipe/genre milik
 * Shinigami — padahal detail selalu dimenangkan Shinigami lebih dulu.
 *
 * Di sini nilai kartu diturunkan dari META DETAIL sumber, dengan fungsi
 * pemilih yang SAMA dengan mergeDetails (pickPrimaryGenre, pickType,
 * pickBestSynopsis) dan urutan tetap Shinigami → Komiku → Komikcast. Sumber
 * berikutnya hanya dibaca bila sumber di atasnya belum punya nilai.
 * Semua pencarian lintas sumber memakai judul + ALIAS (altTitle) lewat
 * `aliasKeys`, dan hasilnya di-cache (versi data) — kartu yang belum sempat
 * dilengkapi di request pertama terisi dari cache di request berikutnya.
 */
const CANON_TTL = 30 * 60_000;

/** "rewriting-my-third-life-id" → "rewriting my third life". */
function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+id\s*\d*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Semaphore sederhana: batasi request upstream paralel dari enrich. */
let canonActive = 0;
const canonWaiters: Array<() => void> = [];
const CANON_MAX = 8;
async function canonSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (canonActive >= CANON_MAX) await new Promise<void>((r) => canonWaiters.push(r));
  canonActive++;
  try {
    return await fn();
  } finally {
    canonActive--;
    canonWaiters.shift()?.();
  }
}

const aliasId = (aliases: string[]): string => aliasKeys(...aliases).sort().join("|");

const shiniIdCache = createKeyedCache<{ id: string | null }>(CANON_TTL, 800);
const shiniIdForTitles = (aliases: string[]): Promise<string | null> =>
  shiniIdCache
    .load(aliasId(aliases), async () => ({ id: await findShiniIdByTitles(aliases) }))
    .then((r) => r.id);

const shiniMetaCache = createKeyedCache<Awaited<ReturnType<typeof fetchShiniMeta>>>(60 * 60_000, 800);
const shiniMetaById = (id: string) => shiniMetaCache.load(id, () => fetchShiniMeta(id));

const komikuSlugCache = createKeyedCache<{ slug: string | null }>(CANON_TTL, 800);
const komikuSlugForTitles = (aliases: string[]): Promise<string | null> =>
  komikuSlugCache
    .load(aliasId(aliases), async () => {
      const want = aliasKeys(...aliases);
      const queries = [...new Set(aliases.flatMap((a) => splitAltTitles(a)))];
      for (const q of queries.filter(Boolean).slice(0, 4)) {
        const { items } = await searchMangaRemote(q, 1);
        const hit = items.find((k) => aliasKeys(k.title, k.altTitle).some((x) => want.includes(x)));
        if (hit) return { slug: hit.slug };
      }
      return { slug: null };
    })
    .then((r) => r.slug);

const kcBriefCache = createKeyedCache<{ slug: string; brief: KcBrief } | null>(CANON_TTL, 800);
const kcBriefForTitles = (title: string, alt?: string): Promise<{ slug: string; brief: KcBrief } | null> =>
  kcBriefCache.load(aliasId([title, alt ?? ""]), async () => {
    try {
      return await resolveKomikcastBriefForTitle(title, dedupeKey, alt);
    } catch (e) {
      // 404 = memang tidak ada (boleh di-cache); lainnya = gangguan sementara.
      if ((e as { status?: number } | null)?.status === 404) return null;
      throw e;
    }
  });

/** Meta seragam per sumber untuk pemilih kanonis. */
interface SrcMeta {
  type?: string;
  genres?: GenreRef[];
  synopsis?: string;
}

interface CanonResult {
  type?: { type: NonNullable<MangaCard["type"]>; source: (typeof SOURCE_PRIORITY)[number] };
  genre?: { name: string; source: (typeof SOURCE_PRIORITY)[number] };
  synopsis?: string;
  /**
   * Pilihan genre/tipe boleh diterapkan: tak ada sumber yang gagal SEMENTARA
   * dan berprioritas lebih tinggi dari pemenang (bisa saja ia pemenang
   * sebenarnya — mis. Shinigami timeout → jangan menerapkan genre Komiku).
   */
  genreCertain: boolean;
  typeCertain: boolean;
}

/** Sinopsis dianggap "cukup baik" (tak perlu mencari lebih jauh) di skor ini. */
const GOOD_SYNOPSIS = 250;

/**
 * Turunkan tipe/genre/sinopsis kanonis satu judul. Sumber dibaca BERURUTAN
 * Shinigami → Komiku → Komikcast dan berhenti begitu semua kebutuhan
 * terpenuhi. `known` = slug sumber yang sudah diketahui kartu.
 */
async function resolveCanonRaw(input: {
  title: string;
  altTitle?: string;
  slugs?: Partial<Record<(typeof SOURCE_PRIORITY)[number], string>>;
  listSynopsis?: string;
}): Promise<CanonResult> {
  const aliases: string[] = [];
  const addAlias = (v?: string | null) => {
    const t = (v ?? "").trim();
    if (t && !aliases.includes(t)) aliases.push(t);
  };
  addAlias(input.title);
  addAlias(input.altTitle);
  // Judul turunan slug Komiku/Komikcast ("rewriting-my-third-life-id" →
  // "rewriting my third life"): jembatan bila judul tampil memakai ejaan lain.
  for (const sl of [input.slugs?.komiku, input.slugs?.komikcast]) {
    if (sl && !isShiniId(sl)) addAlias(slugToTitle(sl));
  }
  const metas: Partial<Record<(typeof SOURCE_PRIORITY)[number], SrcMeta>> = {};
  const failed: Array<(typeof SOURCE_PRIORITY)[number]> = [];
  const isTransient = (e: unknown): boolean => {
    const st = (e as { status?: number } | null)?.status;
    return st !== 404 && st !== 400;
  };
  const synopses: Array<string | undefined> = [undefined, undefined, undefined];
  const done = (): boolean => {
    if (!pickType(metas) || !pickPrimaryGenre(metas)) return false;
    const best = pickBestSynopsis(synopses);
    return !!best && synopsisQuality(best) >= GOOD_SYNOPSIS;
  };
  const record = (s: (typeof SOURCE_PRIORITY)[number], m: SrcMeta) => {
    metas[s] = m;
    synopses[SOURCE_PRIORITY.indexOf(s)] = m.synopsis;
  };

  // 1) Shinigami
  try {
    const id = input.slugs?.shinigami ?? (await canonSlot(() => shiniIdForTitles(aliases)));
    if (id) {
      const m = await canonSlot(() => shiniMetaById(id));
      record("shinigami", { type: m.type, genres: m.genres, synopsis: m.synopsis });
    }
  } catch (e) {
    if (isTransient(e)) failed.push("shinigami");
  }
  // 2) Komiku
  if (!done()) {
    try {
      const slug = input.slugs?.komiku ?? (await canonSlot(() => komikuSlugForTitles(aliases)));
      if (slug) {
        const d = await canonSlot(() => komikuDetailSafe(slug));
        if (d) record("komiku", { type: d.type, genres: d.genres, synopsis: d.synopsis });
        else failed.push("komiku");
      }
    } catch (e) {
      if (isTransient(e)) failed.push("komiku");
    }
  }
  // 3) Komikcast
  if (!done()) {
    try {
      const kc = input.slugs?.komikcast
        ? { slug: input.slugs.komikcast, brief: await canonSlot(() => fetchKomikcastBrief(input.slugs!.komikcast!)) }
        : await canonSlot(() => kcBriefForTitles(input.title, input.altTitle));
      if (kc) record("komikcast", { type: kc.brief.type, genres: kc.brief.genres, synopsis: kc.brief.synopsis });
    } catch {
      // Komikcast = prioritas terendah: kegagalannya tidak mengubah pemenang di atasnya.
    }
  }
  const tp = pickType(metas);
  const gp = pickPrimaryGenre(metas);
  // Daftar sendiri (list) ikut jadi kandidat sinopsis, sebagai yang terakhir.
  let synopsis = pickBestSynopsis([...synopses, input.listSynopsis]);
  // Semua sumber yang terjangkau lewat slug kosong → cari entri lain untuk
  // judul yang sama lewat judul + ALIAS di ketiga sumber (aturan yang sama
  // dengan halaman detail). Hanya teks dari sumber; tidak ada yang dikarang.
  if (!synopsis || !isMeaningfulSynopsis(synopsis)) {
    try {
      const found = await fallbackSynopsisByAliases(aliases, {
        ...(input.slugs?.shinigami ? { shinigami: { slug: input.slugs.shinigami } } : {}),
        ...(input.slugs?.komiku ? { komiku: { slug: input.slugs.komiku } } : {}),
        ...(input.slugs?.komikcast ? { komikcast: { slug: input.slugs.komikcast } } : {}),
      });
      if (found) synopsis = found;
    } catch {
      // diabaikan — kartu tampil tanpa sinopsis
    }
  }
  const rank = (x: (typeof SOURCE_PRIORITY)[number]) => SOURCE_PRIORITY.indexOf(x);
  const safe = (winner?: (typeof SOURCE_PRIORITY)[number]): boolean =>
    failed.every((f) => winner !== undefined && rank(f) > rank(winner));
  return {
    ...(tp ? { type: tp } : {}),
    ...(gp ? { genre: { name: gp.genre.name, source: gp.source } } : {}),
    ...(synopsis ? { synopsis } : {}),
    genreCertain: safe(gp?.source),
    typeCertain: safe(tp?.source),
  };
}

/**
 * Hasil resolusi kanonis di-cache per judul+alias (versi data) dan inflight
 * dedupe: Peringkat, Rekomendasi, Update terbaru, pencarian, dan Serupa yang
 * memuat judul yang sama memakai SATU hasil yang sama — kartu yang lolos
 * batas waktu di satu daftar tidak lagi berbeda label dari daftar lain.
 * Hasil tak pasti (sumber prioritas lebih tinggi gagal sementara) tidak
 * disimpan agar dicoba lagi.
 */
const canonResultCache = createKeyedCache<CanonResult>(CANON_TTL, 1000);
function resolveCanon(input: Parameters<typeof resolveCanonRaw>[0]): Promise<CanonResult> {
  const key = aliasId([input.title, input.altTitle ?? ""]);
  if (!key) return resolveCanonRaw(input);
  return canonResultCache.load(key, () => resolveCanonRaw(input), (r) => r.genreCertain && r.typeCertain);
}

/** Maks kartu yang dilengkapi per panggilan. */
const COMPLETE_CAP = 24;

/**
 * Lengkapi kartu hasil mergeCards supaya tipe, genre utama, dan sinopsisnya
 * SAMA dengan halaman detail (lihat resolveCanon). Aturan:
 *  - genre kartu = genres[0] sumber pemenang (Shinigami → Komiku →
 *    Komikcast), BUKAN Tema; Tema tetap terpisah di detail;
 *  - tipe = sumber pemenang; sumber berikutnya hanya bila pemenang tak
 *    punya tipe;
 *  - sinopsis = kualitas terbaik, fallback lintas sumber lewat alias.
 * Hasil resolusi yang valid TIDAK pernah ditimpa lagi oleh langkah lain
 * (enrich pencarian tidak mengubah genre pemenang).
 *
 * Aman dipanggil dengan batas waktu: kartu yang belum sempat dilengkapi
 * tetap tampil dengan data daftar, dan terisi dari cache pada request
 * berikutnya (kerja upstream tetap berjalan di latar).
 */
export async function completeCards(
  cards: MergedMangaCard[],
  applied?: Set<MergedMangaCard>,
): Promise<void> {
  const todo = cards.slice(0, COMPLETE_CAP);
  await Promise.all(
    todo.map(async (c) => {
      if (!normalizeTitle(c.title)) return;
      let r: CanonResult;
      try {
        r = await resolveCanon({
          title: c.title,
          altTitle: c.altTitle,
          slugs: c.sourceSlug,
          listSynopsis: c.synopsis,
        });
      } catch {
        return;
      }
      if (r.genre && r.genreCertain) {
        c.genre = r.genre.name;
        c.genreSource = r.genre.source;
        applied?.add(c);
      }
      if (r.type && r.typeCertain) {
        c.type = r.type.type;
        c.typeSource = r.type.source;
      }
      if (r.synopsis) c.synopsis = r.synopsis;
    }),
  );
}

/**
 * Kartu yang belum/tak bisa dinormalisasi (timeout, sumber gagal, di luar
 * COMPLETE_CAP) tidak boleh membawa label mentah sumber daftar ke UI: genre
 * hanya dikirim bila kanonis (bentuk Inggris yang sama dengan detail), tipe
 * hanya bila Manga/Manhwa/Manhua. Selain itu dibuang (UI menampilkan kosong).
 */
function sanitizeCardLabels(c: MergedMangaCard): void {
  const g = canonicalGenre(c.genre);
  if (g) c.genre = g.name;
  else delete (c as { genre?: string }).genre;
  const t = normalizeKomikType(c.type);
  if (t) c.type = t;
  else delete (c as { type?: string }).type;
}

/**
 * completeCards dengan batas waktu + jaminan label: setelah batas waktu,
 * kartu yang belum dinormalisasi disanitasi (sanitizeCardLabels). Kerja
 * resolusi tetap berjalan di latar dan mengisi cache bersama, sehingga
 * request berikutnya memakai nilai kanonis yang sama di semua bagian.
 */
export async function completeCardsBounded(cards: MergedMangaCard[], ms: number): Promise<void> {
  const applied = new Set<MergedMangaCard>();
  await withTimeout(completeCards(cards, applied).catch(() => undefined), ms).catch(() => null);
  for (const c of cards) if (!applied.has(c)) sanitizeCardLabels(c);
}

/** Chapter terbaru (Shinigami is_update utama + Komiku ?orderby=modified pelengkap). */
export async function getLatest(page = 1): Promise<MangaCard[]> {
  const params: MangaListParams = { orderby: "modified", page };
  const jobs = {
    komiku: async () => {
      // Coba 2x — kegagalan fragment API sering cuma sementara (beban
      // bersamaan saat /api/home menembak beberapa request sekaligus),
      // jadi jangan langsung jatuh ke fetchHome() yang datanya lebih basi.
      // Total waktu (retry + fallback) dibatasi 10 dtk: kalau fragment API
      // sedang down, 2 retry (16 dtk) + fetchHome (5-8 dtk) bisa menahan
      // /api/home sampai 24 dtk. Timeout membuat source ini gagal cepat
      // sehingga agregator lanjut tanpa menunggu ekor lambatnya.
      const attempt = async () => {
        for (let i = 0; i < 2; i++) {
          try {
            const { items } = await fetchMangaList(params);
            if (items.length > 0) return items;
          } catch {
            // coba lagi (attempt berikutnya) sebelum fallback
          }
        }
        const home = await fetchHome();
        return page > 1 ? [] : home.latest;
      };
      return (await withTimeout(attempt(), 10_000)) ?? [];
    },
    shinigami: async () => {
      const { items } = await fetchShiniLatest(page);
      return items;
    },
    // Komikcast: /api/v1/home → latest_comic (tanpa paging upstream;
    // hanya halaman 1 agar tidak duplikat antar halaman UI).
    komikcast: async () => (page > 1 ? [] : fetchKomikcastLatest()),
  };
  const { data } = await fetchAllSettled(jobs, "latest");
  const merged = mergeCards({
    komiku: data.komiku ?? [],
    shinigami: data.shinigami ?? [],
    komikcast: data.komikcast ?? [],
  });
  // Kartu komikcast-only yang miskin (timing lolos dari halaman-1 source
  // lain) diperkaya via search exact-match — pola sama seperti search.
  // Enrich tetap <=5 kartu; batas waktu 2500 -> 1500 dtk. Enrich hanya
  // melengkapi genre/sinopsis â€” kartu tetap tampil walau dilewati.
  await completeCardsBounded(merged, 1500);
  // Enrich hanya melengkapi kartu yang belum punya record kanonis. Untuk
  // judul yang detailnya sudah pernah di-merge, nilai kanonis dipulihkan di
  // sini supaya genre/tipe/sinopsis/sampul identik dengan halaman detail.
  // Urutkan berdasarkan waktu terbaru secara global (lintas sumber).
  // Prioritas sumber (Shinigami > Komiku > Komikcast) sudah ditangani
  // saat mergeCards: jika komik ada di beberapa sumber, datanya diambil
  // dari sumber prioritas tertinggi. Yang diurutkan di sini murni waktu.
  return sortByFresh(merged);
}

/** Opsi filter daftar terbaru (dipakai /api/latest). */
export interface LatestOpts {
  orderby?: "modified" | "date" | "popular" | "rand" | null;
  tipe?: ShiniFormat | null;
  genre?: string | null;
  genre2?: string | null;
  status?: "ongoing" | "end" | null;
  /** Jumlah kartu yang dikembalikan (default 15 untuk /terbaru; beranda minta 16). */
  limit?: number | null;
  /**
   * Probe live: bypass SEMUA cache (memori latestCache + cache HTTP Next di
   * tiap source) sehingga hasil = kondisi sumber data saat ini. Dipakai
   * auto-refresh klien. Enrich Komikcast dilewati (tak perlu untuk
   * sekadar mendeteksi judul/chapter baru).
   */
  live?: boolean;
  /**
   * Tampilkan acak (dikocok per grup sumber) — dipakai halaman /terbaru.
   * Pengambilan data tetap terurut (pagination upstream tetap koheren),
   * hanya penyajian di layar yang diacak.
   */
  random?: boolean;
}


/**
 * Cache memori 5 dtk per kombinasi halaman + filter. Satu halaman =
 * 3 scrape upstream + enrich Komikcast; mengulang kerja itu untuk halaman
 * yang sama (pagination bolak-balik, prefetch menu, dua tab) hanya
 * menambah beberapa detik latensi. Inflight dedupe ikut menahan request
 * bersamaan. Gate + rate limit tetap jalan di setiap request.
 * TTL sengaja pendek (5 dtk, ≤ interval auto-refresh 5 dtk) agar tiap
 * probe mendapat hasil merge terbaru dari cache upstream 30 dtk.
 */
// TTL dinaikkan 5 dtk -> 30 dtk: probe live (`opts.live`) tetap bypass
// total (lihat getLatestPaged), jadi auto-refresh 30 dtk klien tidak
// terpengaruh. Kunjungan non-live (pagination halaman 2+, prefetch) jadi
// instan dari cache server, bukan scrape 3 source berulang.
const latestCache = createKeyedCache<PagedResult<MangaCard>>(30_000, 50);

/** Dedupe probe live: beberapa tab / tick bersamaan = satu kali scrape. */
const liveInflight = new Map<string, Promise<PagedResult<MangaCard>>>();

/**
 * Daftar terbaru berhalaman + filter (untuk /api/latest & /terbaru).
 * Filter tipe/genre diteruskan ke Shinigami; genre2/status hanya Komiku.
 */
export async function getLatestPaged(
  page = 1,
  opts: LatestOpts = {},
): Promise<PagedResult<MangaCard>> {
  const p = Math.max(1, page);
  const orderby = opts.orderby ?? "modified";
  const limit = Math.max(1, opts.limit ?? 15);
  // Genre di key cache memakai bentuk kanonis: /genre/romansa dan
  // /genre/romance adalah filter yang sama.
  const key = [
    p,
    orderby,
    opts.tipe ?? "",
    opts.genre ? (canonicalGenre(opts.genre)?.slug ?? opts.genre) : "",
    opts.genre2 ? (canonicalGenre(opts.genre2)?.slug ?? opts.genre2) : "",
    opts.status ?? "",
    limit,
    opts.random ? "r" : "",
  ].join("|");
  // `live` = probe: jangan baca/tulis cache memori, langsung rakit ulang.
  // Inflight dedupe mencegah tick 4 dtk menumpuk scrape saat upstream lambat.
  if (opts.live) {
    let pending = liveInflight.get(key);
    if (!pending) {
      pending = buildLatestPaged(p, orderby, opts).finally(() => liveInflight.delete(key));
      liveInflight.set(key, pending);
    }
    return pending;
  }
  return latestCache.load(key, () => buildLatestPaged(p, orderby, opts));
}

async function buildLatestPaged(
  p: number,
  orderby: "modified" | "date" | "popular" | "rand",
  opts: LatestOpts,
): Promise<PagedResult<MangaCard>> {
  const limit = Math.max(1, opts.limit ?? 15);
  // Slug genre kanonis + alias tiap sumber ("romance" â†’ romance, romansa,
  // romantis). Filter genre diteruskan lewat varian ini, bukan slug mentah.
  const genreVars = opts.genre ? upstreamGenreSlugs(opts.genre) : [];
  const genre2Vars = opts.genre2 ? upstreamGenreSlugs(opts.genre2) : [];
  const { data } = await fetchAllSettled(
    {
      komiku: async () => {
        const base = {
          page: p,
          orderby,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { tipe: opts.tipe } : {}),
          ...(opts.genre2 ? { genre2: genre2Vars[0] ?? opts.genre2 } : {}),
          ...(opts.status ? { status: opts.status } : {}),
        };
        if (genreVars.length === 0) return fetchMangaList(base);
        const hit = await firstWithItems(genreVars, (g) => fetchMangaList({ ...base, genre: g }));
        return hit ?? { items: [] as MangaCard[], hasNextPage: false };
      },
      shinigami: async () => {
        const base = {
          pageSize: limit,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { format: opts.tipe } : {}),
        };
        if (genreVars.length === 0) return fetchShiniLatest(p, base);
        const hit = await firstWithItems(genreVars, (g) => fetchShiniLatest(p, { ...base, genre: g }));
        return hit ?? { items: [] as MangaCard[], hasNextPage: false };
      },
      // Komikcast tanpa paging/filter upstream — hanya halaman 1 tanpa filter.
      komikcast: () =>
        p > 1 || opts.tipe || opts.genre || opts.genre2 || opts.status
          ? Promise.resolve({ items: [], hasNextPage: false })
          : fetchKomikcastLatest({ fresh: opts.live === true }).then((items) => ({ items, hasNextPage: false })),
    },
    "latest-paged",
  );
  const merged = mergeCards({
    komiku: data.komiku?.items ?? [],
    shinigami: data.shinigami?.items ?? [],
    komikcast: data.komikcast?.items ?? [],
  });
  // Prioritas data sumber (Shinigami > Komiku > Komikcast) sudah ditangani
  // oleh mergeCards. Di sini cukup urutkan secara global berdasarkan waktu
  // terbaru (paling baru di atas). Pengacakan HANYA terjadi jika user
  // memilih dropdown "Acak" (orderby=rand).
  // `opts.random` (dari ?acak=1) kini benar-benar mengocok - dulu hanya
  // masuk cache key tanpa efek, membuat query memecah cache tanpa hasil.
  const ordered = orderby === "rand" || opts.random ? shuffle(merged) : sortByFresh(merged);
  // hasNextPage HANYA dari paginator sumber. Dulu memakai
  // `merged.length > limit`, padahal gabungan 3 sumber hampir selalu lebih
  // panjang dari limit walau ini halaman terakhir → tombol halaman berikut
  // muncul lalu menampilkan halaman kosong.
  const hasNext = Boolean(
    data.komiku?.hasNextPage || data.shinigami?.hasNextPage || data.komikcast?.hasNextPage,
  );
  // Halaman terakhir (tidak ada lanjutan) → kirim semua sisa, jangan potong.
  // Potong dulu baru perkaya agar enrich detail hanya mengejar kartu yang
  // benar-benar tampil (lebih hemat upstream). Default 15 (/terbaru);
  // beranda meminta 16 agar grid 8-kolom terisi penuh dua baris.
  // Jumlah kartu gabungan sebelum dipotong ke ukuran halaman (dipakai UI
  // untuk label jumlah hasil).
  const total = ordered.length;
  const items = hasNext ? ordered.slice(0, limit) : ordered;
  // Perkaya kartu komikcast-only yang tampil — termasuk saat probe live.
  // Tanpa ini, halaman 1 yang selalu live=1 tidak pernah mendapat genre/
  // sinopsis untuk kartu Komikcast (hanya dari endpoint series yang kadang
  // tidak membawa genre). Timeout lebih longgar untuk non-live.
  // Batas waktu enrich diturunkan (3000/4000 -> 1500/2500). Untuk probe live
  // (auto-refresh klien) respons cepat lebih penting daripada kartu Komikcast
  // lengkap â€” kartu tetap tampil tanpa genre/sinopsis bila lewat batas.
  await completeCardsBounded(items, opts.live ? 1500 : 2500);
  return { items, hasNextPage: hasNext, total };
}

const SHINI_TOP_BY_PERIOD: Record<RankPeriod, ShiniTopFilter> = {
  harian: "daily",
  mingguan: "weekly",
  bulanan: "monthly",
  total: "all_time",
};

/**
 * Komik populer — ranking Komiku (views) + top Shinigami.
 * Kartu ber-views urut desc dulu, kartu murni Shinigami menempel di
 * belakang. Rank tampilan ditulis ulang 1..N agar rapih.
 */
export async function getPopular(period: RankPeriod = "harian"): Promise<MangaCard[]> {
  const { data } = await fetchAllSettled(
    {
      komiku: () => fetchRanking(period),
      shinigami: () => fetchShiniTop(SHINI_TOP_BY_PERIOD[period], 1, 10),
      // Komikcast: trending home (tanpa views → menempel belakang seperti
      // kartu murni Shinigami; tetap berguna untuk dedupe + coverage).
      komikcast: () => fetchKomikcastTrending(),
    },
    "popular",
  );
  const ku = data.komiku ?? [];
  const sh = data.shinigami ?? [];
  const kc = data.komikcast ?? [];
  const merged = mergeCards({ komiku: ku, shinigami: sh, komikcast: kc });
  // "37,061 views" → 37061; tanpa angka (kartu murni Shinigami) → -1 (belakang).
  const viewsNum = (m: { views?: string }): number => {
    const digits = (m.views ?? "").replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && digits ? n : -1;
  };
  const top = [...merged].sort((a, b) => viewsNum(b) - viewsNum(a)).slice(0, 20);
  // Tipe/genre/sinopsis kanonis: peringkat menampilkan nilai yang SAMA dengan
  // beranda, pencarian, dan halaman detail (dulu tidak diperkaya sama sekali,
  // sehingga label Komiku/Tema bocor dan tipe diambil terpisah lewat ringkasan).
  await completeCardsBounded(top, 2500);
  return top.map((m, i) => ({ ...m, rank: i + 1 }));
}

/** Acak array (Fisher-Yates) — agar rekomendasi tampil beda tiap muat. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Komik rekomendasi — acak gabungan ?orderby=rand (Komiku) + rekomendasi Shinigami. */
export async function getRecommended(): Promise<MangaCard[]> {
  const komikuJob = async () => {
    // Coba 2x seperti getLatest — kegagalan fragment API sering sementara.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { items } = await fetchMangaList({ orderby: "rand" });
        if (items.length > 0) return items;
      } catch {
        // coba lagi sebelum fallback
      }
    }
    try {
      const { items } = await fetchMangaList({ orderby: "date" });
      return items;
    } catch {
      return [] as MangaCard[];
    }
  };
  const { data } = await fetchAllSettled(
    {
      komiku: komikuJob,
      shinigami: () => fetchShiniRecommended(),
      komikcast: () => fetchKomikcastLatest(),
    },
    "recommended",
  );
  const merged = mergeCards({
    komiku: data.komiku ?? [],
    shinigami: data.shinigami ?? [],
    komikcast: data.komikcast ?? [],
  });
  const shuffled = shuffle(merged);
  // Rekomendasi memakai aturan kanonis yang sama dengan Update terbaru
  // (tipe/genre sumber pemenang). Hanya bagian yang tampil (urutan acak awal)
  // yang diperkaya; batas waktu menjaga beranda tetap cepat.
  await completeCardsBounded(shuffled, 2500);
  return shuffled;
}

/** Update chapter terbaru (alias getLatest halaman pertama, untuk homepage). */
export async function getLatestUpdate(): Promise<MangaCard[]> {
  return getLatest(1);
}

/**
 * Detail satu komik (multi-source, merge + sources info).
 * Slug UUID → murni Shinigami. Slug manusiawi → ketiga source paralel;
 * Komikcast selalu lewat resolve judul (exact match) karena skema slug-nya
 * beda (tanpa "-id"). Judul diambil dari hasil Komiku/Shinigami bila ada,
 * else dari slug.
 *
 * Cache memori 30 dtk: reader memanggil detail yang sama untuk tiap chapter
 * (butuh daftar chapter + chapter_id), jadi tanpa cache setiap klik Next
 * mengulang seluruh rantai scrape tiga source.
 *
 * `deep: false` melewati tahap resolve sekunder (Komikcast via judul +
 * balik ke Shinigami). Reader tidak butuh itu: URL chapter Komikcast bisa
 * dirakit dari slug + nomor, dan navigasi tetap ditulis ulang dari daftar
 * gabungan — sementara tahap itu menambah 2-3 request berantai per chapter.
 */
// TTL dinaikkan 30 dtk -> 60 dtk: klik chapter -> back -> klik chapter lain
// sering terjadi dalam <1 menit; tanpa cache ini setiap back = scrape tiga
// source ulang. 1 menit cukup untuk navigasi bolak-balik tanpa basi lama.
const detailCache = createKeyedCache<MangaDetail>(60_000, 60);

export async function getMangaDetail(
  slug: string,
  opts: { deep?: boolean } = {},
): Promise<MangaDetail> {
  const deep = opts.deep !== false;
  return detailCache.load(`${deep ? "deep" : "fast"}:${slug}`, () =>
    buildMangaDetail(slug, deep),
  );
}

/**
 * Cari sinopsis lewat JUDUL + ALIAS di semua sumber (termasuk sumber yang
 * sudah terambil tetapi sinopsisnya kosong — bisa jadi ada entri lain untuk
 * judul yang sama dengan slug berbeda). Paralel, gagal = diabaikan; hasil
 * dipilih lewat kualitas (pickBestSynopsis) dengan urutan prioritas sumber.
 * Tidak ada sinopsis yang dikarang: hanya teks dari sumber.
 */
async function fallbackSynopsisByAliases(
  aliases: string[],
  have: Partial<Record<(typeof SOURCE_PRIORITY)[number], { slug: string }>>,
): Promise<string | undefined> {
  const list = [...new Set(aliases.filter(Boolean).flatMap((a) => splitAltTitles(a)))];
  if (list.length === 0) return undefined;
  const jobs: Record<(typeof SOURCE_PRIORITY)[number], () => Promise<string | undefined>> = {
    // Semua lewat helper ber-cache + semaphore canonSlot: kartu daftar yang
    // sinopsisnya kosong tidak melipatgandakan request upstream.
    shinigami: async () => {
      const id = await canonSlot(() => shiniIdForTitles(list));
      if (!id || id === have.shinigami?.slug) return undefined;
      return (await canonSlot(() => shiniMetaById(id))).synopsis;
    },
    komiku: async () => {
      const slug = await canonSlot(() => komikuSlugForTitles(list));
      if (!slug || slug === have.komiku?.slug) return undefined;
      return (await canonSlot(() => komikuDetailSafe(slug)))?.synopsis;
    },
    komikcast: async () => {
      const kc = await canonSlot(() => kcBriefForTitles(list[0], list[1] ?? list[2]));
      if (!kc || kc.slug === have.komikcast?.slug) return undefined;
      return kc.brief.synopsis;
    },
  };
  const results = await Promise.allSettled(SOURCE_PRIORITY.map((s) => jobs[s]()));
  return pickBestSynopsis(
    results.map((r) => (r.status === "fulfilled" ? r.value : undefined)),
  );
}

async function buildMangaDetail(slug: string, deep: boolean): Promise<MangaDetail> {
  // Tahap 1 bisa gagal TOTAL (mis. slug lama "…-id" tidak dikenal Komiku,
  // judulnya tidak ada di Shinigami, dan slug Komikcast beda ejaan). Dulu
  // kegagalan itu langsung dilempar sehingga tahap 2 — resolusi lewat JUDUL —
  // tidak pernah dijalankan, padahal judulnya ADA di Komikcast/Shinigami.
  // Sekarang error disimpan: bila semua gagal karena 404, pencarian lewat
  // judul tetap dicoba; error asli dilempar lagi hanya bila tahap 2 pun kosong.
  type SrcId = (typeof SOURCE_PRIORITY)[number];
  let data: Partial<Record<SrcId, MangaDetail>> = {};
  let firstError: unknown = null;
  try {
    const fetched = await fetchAllSettled(
      {
        komiku: () => fetchMangaDetail(slug),
        shinigami: () => resolveShiniDetailForSlug(slug),
        // Komikcast selalu via resolve judul (skema slug beda: tanpa "-id").
        // Judul dari hasil Komiku/Shinigami bila ada, else dari slug mentah.
        komikcast: async () => {
          if (isShiniId(slug)) throw new Error("Slug UUID tidak ada di Komikcast.");
          // Slug pola Komiku ("...-id" / "...-id-N") → pasti 404 bila
          // ditebak ke /series/<slug>; langsung resolve via judul (tahap 2),
          // hemat 1 request spekulatif. Slug lain tetap direct dulu.
          if (/-id(-\d+)?$/i.test(slug)) throw new Error("Slug Komiku, resolve Komikcast via judul.");
          try {
            // Coba langsung dulu (kasus Komikcast-only, slug sudah tepat).
            return await fetchKomikcastDetail(slug);
          } catch {
            // Bukan slug Komikcast → resolve via judul (tahap 2 di bawah).
            throw new Error("Resolve Komikcast via judul.");
          }
        },
      },
      "detail",
    );
    data = fetched.data;
  } catch (e) {
    firstError = e;
    // Hanya "tidak ditemukan" (404) yang layak diselamatkan lewat judul;
    // gangguan jaringan/5xx tidak diulang supaya respons tidak tertahan.
    if (!deep || isShiniId(slug) || (e as { status?: number } | null)?.status !== 404) throw e;
  }
  // Tahap 2: resolve Komikcast via judul (exact match, konservatif).
  // Gagal = Komikcast absen, sisi lain tetap serve. AltTitle (EN) ikut
  // diteruskan sebagai jembatan bila judul utama beda ejaan.
  if (deep && !data.komikcast && !isShiniId(slug)) {
    const title = data.shinigami?.title ?? data.komiku?.title ?? slug;
    const alt = data.shinigami?.altTitle ?? data.komiku?.altTitle;
    try {
      data.komikcast = await resolveKomikcastDetailForTitle(title, dedupeKey, alt);
    } catch {
      // absen di Komikcast — normal, bukan error
    }
  }
  // Tahap 2b: Shinigami belum ketemu lewat slug → resolve via JUDUL + ALIAS
  // (dari Komiku, bila tidak ada dari Komikcast; exact, tanpa fuzzy). Aturan
  // ini SAMA dengan resolveCanon (kartu), sehingga kartu dan halaman detail
  // memilih sumber pemenang yang sama untuk tipe/genre/sinopsis. Gagal =
  // tetap serve sumber yang ada.
  if (deep && !data.shinigami && !isShiniId(slug)) {
    const base = data.komiku ?? data.komikcast;
    if (base) {
      try {
        data.shinigami = await resolveShiniDetailForSlug(base.title, base.altTitle);
      } catch {
        // absen di Shinigami — normal, bukan error
      }
    }
  }
  const merged: MergedMangaDetail | null = mergeDetails({
    ...(data.komiku ? { komiku: data.komiku } : {}),
    ...(data.shinigami ? { shinigami: data.shinigami } : {}),
    ...(data.komikcast ? { komikcast: data.komikcast } : {}),
  });
  // Tahap 2 juga tidak menemukan apa pun → laporkan error ASLI dari tahap 1
  // (status 404 dari sumber) agar route mengembalikan status yang sama.
  if (!merged) {
    throw firstError instanceof Error ? firstError : new Error("Gagal memuat detail komik.");
  }
  // Sinopsis kosong/placeholder di SEMUA sumber yang terambil → cari lewat
  // judul + ALIAS (semua judul/altTitle dari tiap sumber + judul dari slug)
  // di ketiga sumber, juga entri lain bersumber sama dengan slug berbeda.
  // Hanya sinopsisnya yang dipinjam; slug/chapter detail tidak berubah.
  if (deep && !isMeaningfulSynopsis(merged.synopsis)) {
    const aliases: string[] = [];
    const add = (v?: string | null) => {
      const t = (v ?? "").trim();
      if (t && !aliases.includes(t)) aliases.push(t);
    };
    add(merged.title);
    add(merged.altTitle);
    for (const src of SOURCE_PRIORITY) {
      add(data[src]?.title);
      add(data[src]?.altTitle);
    }
    if (!isShiniId(slug)) add(slug.replace(/-/g, " ").replace(/\s+id\s*\d*$/i, ""));
    const found = await fallbackSynopsisByAliases(aliases, {
      ...(data.shinigami ? { shinigami: data.shinigami } : {}),
      ...(data.komiku ? { komiku: data.komiku } : {}),
      ...(data.komikcast ? { komikcast: data.komikcast } : {}),
    });
    if (found) merged.synopsis = found;
    // Diagnostik (server log): nilai AKTUAL per sumber saat sinopsis tetap
    // kosong/tak bermakna — slug, judul, alias, dan panjang sinopsis hasil
    // bersih. Dipakai untuk menentukan apakah sumbernya memang kosong atau
    // resolve judul/selektor yang gagal. Tidak mengubah data.
    if (!found && !isMeaningfulSynopsis(merged.synopsis)) {
      console.warn(
        "[synopsis-debug]",
        JSON.stringify({
          slug,
          aliases,
          sources: Object.fromEntries(
            SOURCE_PRIORITY.map((src) => [
              src,
              data[src]
                ? {
                    slug: data[src]!.slug,
                    title: data[src]!.title,
                    altTitle: data[src]!.altTitle ?? null,
                    synopsisLen: (data[src]!.synopsis ?? "").length,
                  }
                : "tidak-ditemukan",
            ]),
          ),
        }),
      );
    }
  }
  // Kembalikan sebagai MangaDetail (chapters = MergedChapterItem[] adalah
  // subtype ChapterItem[] + field tambahan) + tempel info sources.
  return merged as MangaDetail & Pick<MergedMangaDetail, "sources" | "sourceSlug">;
}

/**
 * Ringkasan RINGAN satu komik: hanya Komiku (1 request upstream), bukan
 * merge tiga sumber. Dipakai badge tipe di daftar peringkat dan badge
 * "BARU" di halaman favorit — keduanya hanya butuh type/latestChapter,
 * dan versi merge penuh (beberapa request berantai per judul) terlalu
 * berat bila dipanggil untuk 10-20 kartu sekaligus.
 *
 * Cache 1 jam: tipe komik praktis tidak berubah; chapter terbaru boleh
 * tertinggal sampai 1 jam — badge hanya penanda, bukan data utama.
 */
export interface MangaSummary {
  slug: string;
  title: string;
  type?: string;
  /** Genre pertama — dipakai kartu sebagai cadangan bila kartu daftar kosong. */
  genre?: string;
  cover: string;
  latestChapter?: MangaDetail["latestChapter"];
  /** Sumber yang punya judul ini — dipakai badge sumber di kartu (opsional
   *  agar respons lama tetap valid). */
  sources?: ComicSourceId[];
}

const summaryCache = createKeyedCache<{ summary: MangaSummary; complete: boolean }>(
  60 * 60_000,
  200,
);

/** Kegagalan permanen (tidak ada di sumber) vs sementara (jaringan/5xx). */
function isTransientFailure(r: PromiseSettledResult<unknown>): boolean {
  if (r.status !== "rejected") return false;
  const status = (r.reason as { status?: number } | null)?.status;
  return status !== 404 && status !== 400;
}

/**
 * Ringkasan memakai ATURAN YANG SAMA dengan mergeDetails: Shinigami →
 * Komiku (→ Komikcast bila keduanya tak ada) dengan prioritas tetap;
 * genre = genres[0] sumber prioritas tertinggi yang valid, sampul/tipe/
 * judul dari sumber prioritas tertinggi yang punya, chapter terbaru =
 * nomor tertinggi lintas sumber. Dulu hanya Komiku yang dibaca sehingga
 * label di kartu bisa beda dengan halaman detail. Hasil yang kehilangan
 * sumber karena gangguan sementara TIDAK di-cache.
 */
async function buildSummary(clean: string): Promise<{ summary: MangaSummary; complete: boolean }> {
  const uuid = isShiniId(clean);
  const [rk, rs0] = await Promise.allSettled([
    uuid ? Promise.reject(new Error("Slug UUID bukan slug Komiku.")) : fetchMangaDetail(clean),
    resolveShiniDetailForSlug(clean),
  ]);
  let rs: PromiseSettledResult<MangaDetail> = rs0;
  // Shinigami tak ketemu lewat slug → coba lewat judul + alias dari Komiku
  // (aturan yang sama dengan detail & resolveCanon).
  if (rs.status === "rejected" && !isTransientFailure(rs) && rk.status === "fulfilled" && !uuid) {
    try {
      rs = { status: "fulfilled", value: await resolveShiniDetailForSlug(rk.value.title, rk.value.altTitle) };
    } catch (e) {
      rs = { status: "rejected", reason: e };
    }
  }
  const komiku = rk.status === "fulfilled" ? rk.value : undefined;
  const shinigami = rs.status === "fulfilled" ? rs.value : undefined;
  const complete = !isTransientFailure(rs) && (uuid || !isTransientFailure(rk));
  const byDetail: Partial<Record<(typeof SOURCE_PRIORITY)[number], MangaDetail>> = {
    ...(shinigami ? { shinigami } : {}),
    ...(komiku ? { komiku } : {}),
  };
  /** Sumber yang punya judul ini, urut prioritas — untuk badge kartu. */
  const srcList = Object.keys(byDetail) as ComicSourceId[];
  if (!komiku && !shinigami) {
    // Judul khusus Komikcast → ringkasan dari endpoint series Komikcast
    // (1 request, tercache 6 jam di adapter).
    let brief;
    try {
      brief = await fetchKomikcastBrief(clean);
    } catch (e) {
      throw rk.status === "rejected" && !uuid ? rk.reason : e;
    }
    const briefGenre = brief.genre ? genreDisplayName(brief.genre) : undefined;
    return {
      complete,
      summary: {
        slug: clean,
        title: fixTitle(brief.title ?? clean),
        cover: brief.cover ?? "",
        ...(brief.type ? { type: brief.type } : {}),
        ...(briefGenre ? { genre: briefGenre } : {}),
        sources: ["komikcast"],
      },
    };
  }
  const first = (k: "title" | "cover"): string | undefined => {
    for (const s of SOURCE_PRIORITY) {
      const v = byDetail[s]?.[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };
  // Tipe: aturan tunggal pickType (Shinigami → Komiku → Komikcast), sama
  // dengan mergeCards/mergeDetails. Komikcast dibaca HANYA bila sumber
  // pemenang (Shinigami/Komiku) tidak punya tipe.
  let type: string | undefined = pickType(byDetail)?.type;
  if (!type) {
    try {
      type = (await fetchKomikcastBrief(clean)).type;
    } catch {
      try {
        const kc = await kcBriefForTitles(
          first("title") ?? clean,
          byDetail.shinigami?.altTitle ?? byDetail.komiku?.altTitle,
        );
        type = kc?.brief.type;
      } catch {
        // tidak ada di Komikcast — ringkasan tanpa tipe
      }
    }
  }
  const pick = pickPrimaryGenre(byDetail);
  if (!pick) {
    // Kedua sumber utama tanpa genre valid: Komikcast jadi penentu terakhir.
    try {
      const brief = await fetchKomikcastBrief(clean);
      const g = brief.genre ? genreDisplayName(brief.genre) : undefined;
      if (g) {
        const displaySlug = komiku?.slug ?? clean;
        const briefType = type ?? brief.type;
        return {
          complete,
          summary: {
            slug: displaySlug,
            title: fixTitle(first("title") ?? brief.title ?? clean),
            cover: first("cover") ?? brief.cover ?? "",
            ...(briefType ? { type: briefType } : {}),
            genre: g,
            ...summaryLatest(byDetail, displaySlug),
            sources: [...srcList, "komikcast"],
          },
        };
      }
    } catch {
      // Komikcast tidak punya — ringkasan tanpa genre.
    }
  }
  const displaySlug = komiku?.slug ?? clean;
  return {
    complete,
    summary: {
      slug: displaySlug,
      title: fixTitle(first("title") ?? clean),
      cover: first("cover") ?? "",
      ...(type ? { type } : {}),
      ...(pick ? { genre: pick.genre.name } : {}),
      ...summaryLatest(byDetail, displaySlug),
      sources: srcList,
    },
  };
}

function summaryLatest(
  byDetail: Partial<Record<(typeof SOURCE_PRIORITY)[number], MangaDetail>>,
  displaySlug: string,
): { latestChapter?: MangaDetail["latestChapter"] } {
  const latest = pickLatest({
    shinigami: byDetail.shinigami?.latestChapter,
    komiku: byDetail.komiku?.latestChapter,
    komikcast: byDetail.komikcast?.latestChapter,
  })?.ref;
  return latest ? { latestChapter: rewriteShiniUrl(latest, displaySlug) } : {};
}

export async function getMangaSummary(slug: string): Promise<MangaSummary> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  const { summary } = await summaryCache.load(
    clean,
    () => buildSummary(clean),
    (r) => r.complete,
  );
  return summary;
}

/** Daftar chapter satu komik berdasarkan slug. */
export async function getChapterList(slug: string): Promise<MangaDetail["chapters"]> {
  const detail = await getMangaDetail(slug);
  return detail.chapters;
}
