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
  resolveKomikcastDetailForTitle,
} from "./komikcast";
import {
  fetchShiniLatest,
  fetchShiniRecommended,
  fetchShiniTop,
  isShiniId,
  resolveShiniDetailForSlug,
  type ShiniFormat,
  type ShiniTopFilter,
} from "./shinigami";
import {
  fetchAllSettled,
  fixTitle,
  mergeCards,
  mergeDetails,
  normalizeTitle,
  pickLatest,
  pickPrimaryGenre,
  rewriteShiniUrl,
  sortByFresh,
  SOURCE_PRIORITY,
  type MergedMangaCard,
  type MergedMangaDetail,
} from "./aggregator";
import { createKeyedCache } from "./cache";
import { pickBestSynopsis } from "./text";
import { canonicalGenre, genreDisplayName, upstreamGenreSlugs } from "./genre-canonical";
import type { MangaCard, MangaDetail, PagedResult } from "./types";

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

/** Maks kartu yang dilengkapi per panggilan (tiap kartu 1-3 request). */
const COMPLETE_CAP = 10;

/**
 * Lengkapi kartu hasil mergeCards supaya label & sinopsisnya SAMA dengan
 * halaman detail, tanpa memori per instance:
 *
 *  - Genre utama = genres[0] sumber prioritas tertinggi yang valid. Label
 *    genre di KARTU Komiku berasal dari daftar (bisa berisi Tema), jadi
 *    kartu yang genre-nya dimenangkan Komiku ditegaskan lewat detail Komiku
 *    (field Genre terpisah dari Tema) — aturan sama dengan mergeDetails.
 *  - Sinopsis kosong → fallback lintas sumber (detail Komiku, Komikcast,
 *    Shinigami) dengan pencocokan judul `normalizeTitle`; sinopsis dipilih
 *    lewat kualitas, bukan siapa yang datang dulu.
 *  - Kartu Komikcast-only dicari padanannya di Komiku (exact normalizeTitle).
 *
 * Aman dipanggil dengan batas waktu: kartu yang belum sempat dilengkapi
 * tetap tampil dengan data daftar.
 */
export async function completeCards(cards: MergedMangaCard[]): Promise<void> {
  const needy = cards
    .filter(
      (c) =>
        c.genreSource === "komiku" ||
        c.genreSource === "komikcast" ||
        !c.genre ||
        !c.synopsis,
    )
    // Yang paling miskin dulu (tanpa genre/sinopsis), lalu urutan tampil.
    .map((c, i) => ({ c, i, miss: (c.genre ? 0 : 1) + (c.synopsis ? 0 : 1) }))
    .sort((a, b) => b.miss - a.miss || a.i - b.i)
    .slice(0, COMPLETE_CAP)
    .map((x) => x.c);
  if (needy.length === 0) return;
  await Promise.all(
    needy.map(async (c) => {
      const norm = normalizeTitle(c.title);
      if (!norm) return;
      const wantsGenre = c.genreSource !== "shinigami";
      // 1) Padanan Komiku: slug yang sudah ada, atau cari exact-match judul.
      let kSlug = c.sourceSlug?.komiku;
      if (!kSlug && (wantsGenre || !c.synopsis)) {
        try {
          const { items } = await searchMangaRemote(c.title, 1);
          const hit = items.find((k) => normalizeTitle(fixTitle(k.title)) === norm);
          if (hit) {
            kSlug = hit.slug;
            if (!c.sources.includes("komiku")) {
              c.sources.push("komiku");
              c.sourceSlug = { ...c.sourceSlug, komiku: hit.slug };
              c.sources.sort((a, b) => SOURCE_PRIORITY.indexOf(a) - SOURCE_PRIORITY.indexOf(b));
            }
            if (!c.firstChapter && hit.firstChapter) c.firstChapter = hit.firstChapter;
          }
        } catch {
          // biarin — lanjut ke fallback sumber lain
        }
      }
      if (kSlug) {
        const d = await komikuDetailSafe(kSlug);
        if (d) {
          if (wantsGenre) {
            const pick = pickPrimaryGenre({ komiku: d });
            if (pick) {
              c.genre = pick.genre.name;
              c.genreSource = "komiku";
            }
          }
          const syn = pickBestSynopsis([c.synopsis, d.synopsis]);
          if (syn) c.synopsis = syn;
          if (!c.type && d.type) c.type = d.type as NonNullable<MangaCard["type"]>;
        }
      }
      if (c.genre && c.synopsis) return;
      // 2) Komikcast: ringkasan series (slug sendiri, atau slug tebakan judul).
      try {
        const kcSlug =
          c.sourceSlug?.komikcast ??
          norm.replace(/\s+/g, "-");
        const brief = await fetchKomikcastBrief(kcSlug);
        if (brief.title && normalizeTitle(fixTitle(brief.title)) !== norm && !c.sourceSlug?.komikcast) {
          throw new Error("judul tidak cocok");
        }
        if (!c.genre && brief.genre) {
          c.genre = genreDisplayName(brief.genre) ?? c.genre;
          if (c.genre) c.genreSource = "komikcast";
        }
        if (!c.type && brief.type) c.type = brief.type;
        const syn = pickBestSynopsis([c.synopsis, brief.synopsis]);
        if (syn) c.synopsis = syn;
      } catch {
        // tidak ada di Komikcast — normal
      }
      if (c.synopsis) return;
      // 3) Terakhir: Shinigami lewat judul (exact, tanpa fuzzy).
      if (!c.sourceSlug?.shinigami) {
        try {
          const d = await resolveShiniDetailForSlug(c.title, c.altTitle);
          const syn = pickBestSynopsis([d.synopsis]);
          if (syn) c.synopsis = syn;
        } catch {
          // absen di Shinigami — normal
        }
      }
    }),
  );
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
  await withTimeout(completeCards(merged), 1500);
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
  await withTimeout(completeCards(items), opts.live ? 1500 : 2500);
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
  const ranked = [...merged].sort((a, b) => viewsNum(b) - viewsNum(a));
  // Genre/tipe/sampul kanonis â€” peringkat menampilkan nilai yang sama dengan
  // beranda, pencarian, dan halaman detail.
  return ranked.slice(0, 20).map((m, i) => ({ ...m, rank: i + 1 }));
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
  return shuffle(merged);
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
 * Cari sinopsis di sumber yang belum terambil, dicocokkan lewat judul
 * (normalizeTitle exact). Paralel, gagal = diabaikan; hasil dipilih lewat
 * kualitas (pickBestSynopsis) dengan urutan prioritas sumber.
 */
async function fallbackSynopsisByTitle(
  title: string,
  altTitle: string | undefined,
  have: Set<string>,
): Promise<string | undefined> {
  const norm = normalizeTitle(title);
  if (!norm) return undefined;
  const tryKomiku = async (): Promise<string | undefined> => {
    const { items } = await searchMangaRemote(title, 1);
    const hit = items.find((k) => normalizeTitle(fixTitle(k.title)) === norm);
    return hit ? (await fetchMangaDetail(hit.slug)).synopsis : undefined;
  };
  const jobs: Record<string, () => Promise<string | undefined>> = {
    shinigami: async () => (await resolveShiniDetailForSlug(title, altTitle)).synopsis,
    komiku: tryKomiku,
    komikcast: async () =>
      (await resolveKomikcastDetailForTitle(title, normalizeTitle, altTitle)).synopsis,
  };
  const order = SOURCE_PRIORITY.filter((s) => !have.has(s));
  const results = await Promise.allSettled(order.map((s) => jobs[s]()));
  return pickBestSynopsis(
    results.map((r) => (r.status === "fulfilled" ? r.value : undefined)),
  );
}

async function buildMangaDetail(slug: string, deep: boolean): Promise<MangaDetail> {
  const { data } = await fetchAllSettled(
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
  // Tahap 2: resolve Komikcast via judul (exact match, konservatif).
  // Gagal = Komikcast absen, sisi lain tetap serve. AltTitle (EN) ikut
  // diteruskan sebagai jembatan bila judul utama beda ejaan.
  if (deep && !data.komikcast && !isShiniId(slug)) {
    const title = data.shinigami?.title ?? data.komiku?.title ?? slug;
    const alt = data.shinigami?.altTitle ?? data.komiku?.altTitle;
    try {
      data.komikcast = await resolveKomikcastDetailForTitle(title, normalizeTitle, alt);
    } catch {
      // absen di Komikcast — normal, bukan error
    }
  }
  // Tahap 2b: slug Komikcast-only → coba resolve Shinigami via judul+alt
  // Komikcast (exact). Berhasil = halaman detail ikut dapat chapter + cover
  // Shinigami; gagal = tetap serve Komiku+Komikcast.
  if (deep && !data.shinigami && data.komikcast && !isShiniId(slug)) {
    try {
      data.shinigami = await resolveShiniDetailForSlug(
        data.komikcast.slug,
        data.komikcast.altTitle,
      );
    } catch {
      // absen di Shinigami — normal, bukan error
    }
  }
  const merged: MergedMangaDetail | null = mergeDetails({
    ...(data.komiku ? { komiku: data.komiku } : {}),
    ...(data.shinigami ? { shinigami: data.shinigami } : {}),
    ...(data.komikcast ? { komikcast: data.komikcast } : {}),
  });
  if (!merged) throw new Error("Gagal memuat detail komik.");
  // Sinopsis kosong di SEMUA sumber yang terambil → cari di sumber yang
  // belum terambil lewat judul (`normalizeTitle`, exact, tanpa fuzzy). Hanya
  // sinopsisnya yang dipinjam; slug/chapter detail tidak berubah.
  if (deep && !merged.synopsis) {
    const found = await fallbackSynopsisByTitle(
      merged.title,
      merged.altTitle,
      new Set(merged.sources),
    );
    if (found) merged.synopsis = found;
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
  const [rk, rs] = await Promise.allSettled([
    uuid ? Promise.reject(new Error("Slug UUID bukan slug Komiku.")) : fetchMangaDetail(clean),
    resolveShiniDetailForSlug(clean),
  ]);
  const komiku = rk.status === "fulfilled" ? rk.value : undefined;
  const shinigami = rs.status === "fulfilled" ? rs.value : undefined;
  const complete = !isTransientFailure(rs) && (uuid || !isTransientFailure(rk));
  const byDetail: Partial<Record<(typeof SOURCE_PRIORITY)[number], MangaDetail>> = {
    ...(shinigami ? { shinigami } : {}),
    ...(komiku ? { komiku } : {}),
  };
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
      },
    };
  }
  const first = (k: "title" | "cover" | "type"): string | undefined => {
    for (const s of SOURCE_PRIORITY) {
      const v = byDetail[s]?.[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };
  const pick = pickPrimaryGenre(byDetail);
  if (!pick) {
    // Kedua sumber utama tanpa genre valid: Komikcast jadi penentu terakhir.
    try {
      const brief = await fetchKomikcastBrief(clean);
      const g = brief.genre ? genreDisplayName(brief.genre) : undefined;
      if (g) {
        const displaySlug = komiku?.slug ?? clean;
        const type = first("type") ?? brief.type;
        return {
          complete,
          summary: {
            slug: displaySlug,
            title: fixTitle(first("title") ?? brief.title ?? clean),
            cover: first("cover") ?? brief.cover ?? "",
            ...(type ? { type } : {}),
            genre: g,
            ...summaryLatest(byDetail, displaySlug),
          },
        };
      }
    } catch {
      // Komikcast tidak punya — ringkasan tanpa genre.
    }
  }
  const displaySlug = komiku?.slug ?? clean;
  const type = first("type");
  return {
    complete,
    summary: {
      slug: displaySlug,
      title: fixTitle(first("title") ?? clean),
      cover: first("cover") ?? "",
      ...(type ? { type } : {}),
      ...(pick ? { genre: pick.genre.name } : {}),
      ...summaryLatest(byDetail, displaySlug),
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
