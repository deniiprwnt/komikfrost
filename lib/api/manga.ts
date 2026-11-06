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
  mergeCards,
  mergeDetails,
  normalizeTitle,
  sortByFresh,
  type MergedMangaCard,
  type MergedMangaDetail,
} from "./aggregator";
import { createKeyedCache } from "./cache";
import type { MangaCard, MangaDetail, PagedResult } from "./types";

/**
 * Perkaya kartu miskin (tanpa genre & sinopsis) yang HANYA dari Komikcast.
 * Penyebab umum: judul lolos dari halaman-1 Komiku karena beda timing
 * update antar source, padahal judulnya ADA di Komiku (terbukti: search
 * exact-match menemukan + punya genre/sinopsis).
 * Resolve exact-match Komiku saja (tanpa fuzzy, tanpa fallback Shinigami
 * agar beban tetap ringan), paralel max 5, gagal = biarin kosong.
 * Hasil enrich ditempel + source badge dilengkapi (komiku ikut).
 */
/** Batas waktu kerja tambahan agar respons tidak tertahan upstream. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function enrichKomikcastOnly(cards: MergedMangaCard[]): Promise<void> {
  const needy = cards
    .filter(
      (c) =>
        c.sources.length === 1 &&
        c.sources[0] === "komikcast" &&
        !c.genre &&
        !c.synopsis &&
        c.sourceSlug?.komikcast,
    )
    .slice(0, 5);
  if (needy.length === 0) return;
  await Promise.all(
    needy.map(async (c) => {
      const norm = normalizeTitle(c.title);
      if (!norm) return;
      try {
        const { items } = await searchMangaRemote(c.title, 1);
        const hit = items.find((k) => normalizeTitle(k.title) === norm);
        if (!hit) return;
        if (hit.genre) c.genre = hit.genre;
        if (hit.synopsis) c.synopsis = hit.synopsis;
        if (hit.type && !c.type) c.type = hit.type;
        if (hit.firstChapter && !c.firstChapter) c.firstChapter = hit.firstChapter;
        if (!c.sources.includes("komiku")) {
          c.sources.push("komiku");
          c.sourceSlug = { ...c.sourceSlug, komiku: hit.slug };
        }
        // Kartu search Komiku tidak bawa sinopsis ("Update X lalu." bukan
        // narasi) → ambil dari halaman detailnya (1 request, gagal = biarin).
        // Tolak teks placeholder upstream ("Belum ada isi.") agar kartu tidak
        // menampilkan teks sampah.
        if (!c.synopsis) {
          try {
            const d = await fetchMangaDetail(hit.slug);
            const s = (d.synopsis ?? "").trim();
            if (s && !/^belum ada (isi|sinopsis|deskripsi)/i.test(s.replace(/\s+/g, " "))) c.synopsis = d.synopsis;
          } catch {
            // biarin kosong
          }
        }
      } catch {
        // biarin kosong — kartu tetap tampil apa adanya
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
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { items } = await fetchMangaList(params);
          if (items.length > 0) return items;
        } catch {
          // coba lagi (attempt berikutnya) sebelum fallback
        }
      }
      const home = await fetchHome();
      return page > 1 ? [] : home.latest;
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
  await withTimeout(enrichKomikcastOnly(merged), 2500);
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
const latestCache = createKeyedCache<PagedResult<MangaCard>>(5_000, 50);

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
  const key = [
    p,
    orderby,
    opts.tipe ?? "",
    opts.genre ?? "",
    opts.genre2 ?? "",
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
  const { data } = await fetchAllSettled(
    {
      komiku: () =>
        fetchMangaList({
          page: p,
          orderby,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { tipe: opts.tipe } : {}),
          ...(opts.genre ? { genre: opts.genre } : {}),
          ...(opts.genre2 ? { genre2: opts.genre2 } : {}),
          ...(opts.status ? { status: opts.status } : {}),
        }),
      shinigami: () =>
        fetchShiniLatest(p, {
          pageSize: limit,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { format: opts.tipe } : {}),
          ...(opts.genre ? { genre: opts.genre } : {}),
        }),
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
  const ordered = orderby === "rand" ? shuffle(merged) : sortByFresh(merged);
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
  const items = hasNext ? ordered.slice(0, limit) : ordered;
  // Probe live: lewati enrich (2-3 request berantai) — auto-refresh hanya
  // perlu tahu judul/chapter baru, dan probe harus tetap cepat.
  // Non-live pun diberi batas waktu: kartu tetap tampil tanpa genre/sinopsis
  // bila upstream detail lambat.
  if (!opts.live) await withTimeout(enrichKomikcastOnly(items), 2500);
  return { items, hasNextPage: hasNext };
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
const detailCache = createKeyedCache<MangaDetail>(30_000, 60);

export async function getMangaDetail(
  slug: string,
  opts: { deep?: boolean } = {},
): Promise<MangaDetail> {
  const deep = opts.deep !== false;
  return detailCache.load(`${deep ? "deep" : "fast"}:${slug}`, () =>
    buildMangaDetail(slug, deep),
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
  cover: string;
  latestChapter?: MangaDetail["latestChapter"];
}

const summaryCache = createKeyedCache<MangaSummary>(60 * 60_000, 200);

export async function getMangaSummary(slug: string): Promise<MangaSummary> {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return summaryCache.load(clean, async () => {
    const d = await fetchMangaDetail(clean);
    return {
      slug: d.slug,
      title: d.title,
      cover: d.cover,
      ...(d.type ? { type: d.type } : {}),
      ...(d.latestChapter ? { latestChapter: d.latestChapter } : {}),
    };
  });
}

/** Daftar chapter satu komik berdasarkan slug. */
export async function getChapterList(slug: string): Promise<MangaDetail["chapters"]> {
  const detail = await getMangaDetail(slug);
  return detail.chapters;
}
