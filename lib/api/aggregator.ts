import type { ChapterItem, ChapterRef, GenreRef, MangaCard, MangaDetail } from "./types";
// ID source terpusat di types (satu definisi, dipakai client + server).
import type { ComicSourceId } from "./types";
export type { ComicSourceId } from "./types";

/**
 * Aggregator multi-source: Shinigami + Komiku → satu bentuk data gabungan.
 *
 * Alur: fetch paralel per source (partial failure: satu gagal ≠ semua gagal)
 * → normalisasi judul → dedupe → merge (SHINIGAMI utama, Komiku fallback
 * PER CHAPTER).
 *
 * Data asli tiap source TIDAK dihapus — disimpan di field `sources` /
 * `chapterSources` agar frontend bisa menampilkan badge & fallback.
 */

/** Tambah source baru = tambah satu nilai di types + scraper + entri priority. */

/**
 * URUTAN PRIORITAS FINAL — JANGAN DIBALIK:
 * SHINIGAMI SELALU UTAMA, Komiku fallback kedua, Komikcast fallback ketiga.
 * Semua merge (kartu/detail/chapter) memakai urutan ini — data Shinigami
 * menang bila tersedia; Komikcast hanya mengisi yang kosong di keduanya.
 */
export const SOURCE_PRIORITY: ComicSourceId[] = ["shinigami", "komiku", "komikcast"];

export const SOURCE_LABEL: Record<ComicSourceId, string> = {
  komiku: "Komiku",
  shinigami: "Shinigami",
  komikcast: "Komikcast",
};

/* ------------------------------------------------------------------ */
/* Normalisasi judul                                                    */
/* ------------------------------------------------------------------ */

/**
 * Normalisasi judul untuk matching lintas source:
 * - lowercase + trim + multiple-spaces → satu spasi
 * - tanda hubung/underscore/dash variants → spasi
 * - tanda baca non-alfanumerik dihapus ("One Piece!" → "one piece")
 * - unicode quotes/diacritics dinormalisasi ("I’m" → "im")
 *
 * Konservatif: TIDAK ada fuzzy/levenshtein — hanya exact match hasil
 * normalisasi yang dianggap sama.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritik
    .replace(/[’‘`´]/g, "'")
    .replace(/[-------_]+/g, " ") // semua varian dash/underscore → spasi
    .replace(/[^a-z0-9\s]/g, " ") // tanda baca → spasi
    .replace(/\s+/g, " ")
    .trim();
}

/** "Chapter 224" / "Ch. 224" → "224" (kunci dedupe chapter). */
export function normalizeChapterKey(raw: string): string {
  const t = raw
    .toLowerCase()
    .replace(/[<>]/g, "") // sisa tag <chapter> literal — isi angka dipertahankan
    .replace(/^(chapter|ch\.?|episode|eps\.?)\s*/i, "")
    .replace(/[^a-z0-9.\-]/g, "")
    .trim();
  return t;
}

/* ------------------------------------------------------------------ */
/* Tipe gabungan (extends tipe lama, non-breaking)                      */
/* ------------------------------------------------------------------ */

/** Referensi chapter dari satu source tertentu. */
export interface ChapterSourceRef {
  source: ComicSourceId;
  /** path/url chapter di source asalnya */
  url: string;
  /** ID chapter native (Shinigami) — bila ada, reader skip chapter-list. */
  chapterId?: string;
}

/**
 * Chapter gabungan: satu label + daftar source penyedia.
 * `url` = url source prioritas (Shinigami bila ada) — dipakai link default
 * agar komponen lama (chapterPathToRoute) tetap jalan tanpa perubahan.
 */
export interface MergedChapterItem extends ChapterItem {
  sources: ChapterSourceRef[];
}

/**
 * Kartu gabungan: field lama (slug/title/thumbnail/...) = data source
 * prioritas; `sources` mencatat semua source penyedia.
 * `sourceSlug` = slug di tiap source (untuk fetch detail per source).
 * Slug tampilan = slug Komiku bila ada (URL manusiawi), else ID Shinigami.
 */
export interface MergedMangaCard extends MangaCard {
  sources: ComicSourceId[];
  sourceSlug: Partial<Record<ComicSourceId, string>>;
}

/** Detail gabungan: chapters = MergedChapterItem[] (compatible: subtype). */
export interface MergedMangaDetail extends Omit<MangaDetail, "chapters"> {
  sources: ComicSourceId[];
  sourceSlug: Partial<Record<ComicSourceId, string>>;
  chapters: MergedChapterItem[];
}

/* ------------------------------------------------------------------ */
/* Merge kartu                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gabungkan daftar kartu dari beberapa source → kartu unik.
 * Matching: normalizeTitle exact (TIDAK menggabungkan dua judul
 * ternormalisasi berbeda walau mirip). Jembatan tambahan: dua grup
 * yang berbagi altTitle (EN) yang SAMA PERSIS ikut digabung (exact,
 * bukan fuzzy) — menangani upstream yang memotong judul utama
 * ("...Desu" → "...Des") tapi menyimpan judul EN lengkap yang identik.
 */
export function mergeCards(lists: Partial<Record<ComicSourceId, MangaCard[]>>): MergedMangaCard[] {
  const groups = new Map<string, { cards: Partial<Record<ComicSourceId, MangaCard>> }>();
  const keyOf = (c: MangaCard): string => {
    const t = normalizeTitle(c.title);
    return t ? `t:${t}` : "";
  };
  const altKeyOf = (c: MangaCard): string => {
    const a = c.altTitle ? normalizeTitle(c.altTitle) : "";
    return a && a !== normalizeTitle(c.title) ? `t:${a}` : "";
  };
  // Pass 1: grup per judul utama.
  for (const s of SOURCE_PRIORITY) {
    for (const c of lists[s] ?? []) {
      const gkey = keyOf(c);
      if (!gkey) continue;
      let g = groups.get(gkey);
      if (!g) {
        g = { cards: {} };
        groups.set(gkey, g);
      }
      // Satu source satu slot — duplikat dalam source yang sama dibuang.
      if (!g.cards[s]) g.cards[s] = c;
    }
  }
  // Pass 2: satukan grup-grup yang berbagi altKey SAMA PERSIS.
  // Grup penyerap = grup yang pertama dikenal (prioritas judul Shinigami).
  const altIndex = new Map<string, string[]>();
  for (const [k, g] of groups) {
    for (const s of SOURCE_PRIORITY) {
      const c = g.cards[s];
      if (!c) continue;
      const ak = altKeyOf(c);
      if (!ak) continue;
      const arr = altIndex.get(ak);
      if (arr && !arr.includes(k)) arr.push(k);
      else if (!arr) altIndex.set(ak, [k]);
    }
  }
  const absorbed = new Set<string>();
  for (const [, keys] of altIndex) {
    if (keys.length < 2) continue;
    const target = keys[0];
    const tg = groups.get(target);
    if (!tg) continue;
    for (const k of keys.slice(1)) {
      if (k === target || absorbed.has(k)) continue;
      const g = groups.get(k);
      if (!g) continue;
      for (const s of SOURCE_PRIORITY) {
        if (g.cards[s] && !tg.cards[s]) tg.cards[s] = g.cards[s]!;
      }
      absorbed.add(k);
    }
  }
  for (const k of absorbed) groups.delete(k);

  const out: MergedMangaCard[] = [];
  for (const [, g] of groups) {
    const present = SOURCE_PRIORITY.filter((s) => g.cards[s]);
    const slugs: Partial<Record<ComicSourceId, string>> = {};
    for (const s of present) slugs[s] = g.cards[s]!.slug;

    // Slug tampilan = slug manusiawi (Komiku, lalu Komikcast) bila ada agar
    // route /komik/<slug> tetap valid; else ID Shinigami (UUID).
    const displaySlug = g.cards.komiku?.slug ?? g.cards.komikcast?.slug ?? g.cards[present[0]]!.slug;
    const primary = present[0];
    const p = g.cards[primary]!;
    const getCard = <K extends keyof MangaCard>(k: K): MangaCard[K] | undefined => {
      for (const s of SOURCE_PRIORITY) {
        const v = g.cards[s]?.[k];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
      }
      return undefined;
    };
    // firstChapter: Komiku (dari HTML, nomor asli) menang atas tebakan
    // "Chapter 1" kartu list Shinigami; fallback ke getCard bila Komiku absen.
    // Koreksi: bila pemenang bernomor > 1 dari kartu Komikcast (tebakan
    // latest − count + 1, katalog parsial) SEMENTARA kartu gabungan juga
    // punya Komiku/Shinigami (katalog penuh) → turunkan ke Chapter 1
    // dengan URL pola source prioritas. Kartu komikcast-only tak tersentuh.
    let firstCh = g.cards.komiku?.firstChapter ?? getCard("firstChapter");
    {
      const n = chapterNum(firstCh?.label);
      const kcFirst = g.cards.komikcast?.firstChapter;
      const fromKcGuess =
        !!firstCh && !!kcFirst && firstCh.url === kcFirst.url && Number.isFinite(n) && (n as number) > 1;
      const fullSlug = g.cards.komiku?.slug ?? g.cards.shinigami?.slug;
      if (fromKcGuess && fullSlug) {
        firstCh = { label: "Chapter 1", url: `/${fullSlug}-chapter-1/` };
      }
    }
    // latestChapter lintas source: nomor TERTINGGI menang; nomor sama →
    // Shinigami menang via urutan SOURCE_PRIORITY. URL chapter Shinigami
    // ditulis ulang memakai displaySlug agar route /baca tetap valid.
    let latestCh = getCard("latestChapter");
    // Source penyedia latest (untuk badge di tombol Terbaru).
    let latestSrc: ComicSourceId | undefined;
    for (const s of SOURCE_PRIORITY) {
      if (latestCh && g.cards[s]?.latestChapter?.url === latestCh.url) {
        latestSrc = s;
        break;
      }
    }
    {
      let best = chapterNum(latestCh?.label);
      if (Number.isFinite(best)) {
        for (const s of SOURCE_PRIORITY) {
          const cand = g.cards[s]?.latestChapter;
          const n = chapterNum(cand?.label);
          // strictly lebih besar → ganti; sama → pertahankan (Shinigami lebih dulu).
          if (cand && Number.isFinite(n) && n > best) {
            best = n;
            latestCh = cand;
            latestSrc = s;
          }
        }
      }
    }
    // Waktu kartu = sumber PRIORITAS TERTINGGI yang SUDAH punya chapter
    // terbaru (nomor tertinggi lintas source):
    //  - Komiku muncul duluan, Shinigami/Komikcast belum → waktu Komiku.
    //  - Begitu Shinigami ikut punya chapter itu → ganti ke waktu Shinigami.
    //  - Komikcast hanya dipakai bila Shinigami & Komiku belum punya.
    // Urutan prioritas: shinigami → komiku → komikcast. Berlaku untuk semua
    // komik. Badge `latestSource` tetap mengikuti source chapter.
    let mergedUpdatedAt: string | undefined;
    let mergedUpdatedAtTs: number | undefined;
    {
      const now = Date.now();
      let topNum = NaN;
      for (const s of SOURCE_PRIORITY) {
        const n = chapterNum(g.cards[s]?.latestChapter?.label);
        if (Number.isFinite(n) && !(n <= topNum)) topNum = n;
      }
      // "Sudah punya" = nomor chapter terbarunya >= nomor tertinggi. Bila
      // nomor tak terparse di mana pun, semua source dianggap sudah punya.
      const hasTop = (s: ComicSourceId): boolean => {
        if (!Number.isFinite(topNum)) return true;
        const n = chapterNum(g.cards[s]?.latestChapter?.label);
        return Number.isFinite(n) && n >= topNum;
      };
      const pick =
        SOURCE_PRIORITY.find((s) => g.cards[s]?.updatedAt && hasTop(s)) ??
        SOURCE_PRIORITY.find((s) => g.cards[s]?.updatedAt);
      if (pick) {
        mergedUpdatedAt = g.cards[pick]!.updatedAt;
        mergedUpdatedAtTs = g.cards[pick]!.updatedAtTs;
        // Badge sumber ikut sumber waktu: sumber prioritas tertinggi yang
        // sudah punya chapter terbaru. Komiku muncul dulu → badge KOMIKU;
        // Shinigami menyusul → otomatis jadi SHINIGAMI.
        if (hasTop(pick)) latestSrc = pick;
      }
      // Jaminan timestamp absolut — label tidak boleh membeku di teks scrape.
      if (mergedUpdatedAt && typeof mergedUpdatedAtTs !== "number") {
        const m = updatedAtMinutes(mergedUpdatedAt);
        if (Number.isFinite(m)) mergedUpdatedAtTs = now - m * 60_000;
      }
    }
    out.push({
      slug: displaySlug,
      title: (getCard("title") as string) ?? p.title,
      thumbnail: (getCard("thumbnail") as string) ?? p.thumbnail,
      ...(getCard("altTitle") ? { altTitle: getCard("altTitle") as string } : {}),
      ...(getCard("type") ? { type: getCard("type") as NonNullable<MangaCard["type"]> } : {}),
      ...(getCard("genre") ? { genre: getCard("genre") as string } : {}),
      ...(mergedUpdatedAt ? { updatedAt: mergedUpdatedAt } : {}),
      ...(typeof mergedUpdatedAtTs === "number" ? { updatedAtTs: mergedUpdatedAtTs } : {}),
      ...(getCard("synopsis") ? { synopsis: getCard("synopsis") as string } : {}),
      ...(firstCh ? { firstChapter: rewriteShiniUrl(firstCh, displaySlug) } : {}),
      ...(latestCh ? { latestChapter: rewriteShiniUrl(latestCh, displaySlug) } : {}),
      ...(latestSrc ? { latestSource: latestSrc } : {}),
      ...(getCard("views") ? { views: getCard("views") as string } : {}),
      ...(getCard("rank") !== undefined ? { rank: getCard("rank") as number } : {}),
      sources: present,
      sourceSlug: slugs,
    });
  }
  return out;
}

/**
 * URL chapter Shinigami memakai UUID (`/<manga_id>-chapter-N/`); bila kartu
 * gabungan memakai slug Komiku sebagai slug tampilan, tulis ulang prefixnya
 * agar chapterPathToRoute menghasilkan /baca/<slug-tampilan>/<N>.
 * URL Komiku (native path) dibiarkan apa adanya.
 */
function rewriteShiniUrl<T extends ChapterRef>(ref: T, displaySlug: string): T {
  const m = ref.url.match(/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-chapter-(.+?)\/?$/i);
  if (!m) return ref;
  return { ...ref, url: `/${displaySlug}-chapter-${m[1]}/` };
}

/* ------------------------------------------------------------------ */
/* Urut terbaru lintas source                                             */
/* ------------------------------------------------------------------ */

/**
 * Titik waktu absolut yang STABIL antar-scrape.
 *
 * Sumber hanya memberi teks relatif ("9 menit lalu"). Menghitung
 * `Date.now() - menit` di TIAP scrape membuat waktu "dijangkar ulang" ke
 * sekarang: kalau teks sumber basi (cache HTTP/CDN) atau daftar diganti
 * ulang oleh auto-refresh, label tertahan di "9 menit lalu" selamanya.
 *
 * Di sini perkiraan pertama disimpan per kunci (slug + chapter terbaru) dan
 * perkiraan berikutnya hanya boleh MEMUNDURKAN waktu (lebih tua) — tidak
 * pernah memajukannya. Kunci berganti (chapter baru) → mulai dari awal.
 */
const tsAnchors = new Map<string, number>();
export function anchorTs(key: string, agoMinutes: number, extraAgeMs = 0): number | undefined {
  if (!Number.isFinite(agoMinutes)) return undefined;
  const est = Date.now() - extraAgeMs - agoMinutes * 60_000;
  const prev = tsAnchors.get(key);
  const next = prev === undefined ? est : Math.min(prev, est);
  tsAnchors.delete(key);
  tsAnchors.set(key, next);
  if (tsAnchors.size > 2000) {
    const oldest = tsAnchors.keys().next().value;
    if (oldest !== undefined) tsAnchors.delete(oldest);
  }
  return next;
}

/**
 * "3 menit lalu" / "2 jam lalu" / "1 hari lalu" (ID & EN) → menit.
 * Tanpa waktu terparse → Infinity (paling belakang, tapi tetap tampil).
 */
export function updatedAtMinutes(raw?: string): number {
  if (!raw) return Infinity;
  const t = raw.toLowerCase().trim();
  // "baru saja" / "just now" = paling baru (tanpa angka).
  if (/^(baru saja|just now)$/.test(t)) return 0;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:yang\s+)?(detik|second|menit|minute|jam|hour|hari|day|minggu|week|bulan|month|tahun|year)/);
  if (!m) return Infinity;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return Infinity;
  const unit = m[2];
  const per =
    unit.startsWith("detik") || unit.startsWith("second") ? 1 / 60
    : unit.startsWith("menit") || unit.startsWith("minute") ? 1
    : unit.startsWith("jam") || unit.startsWith("hour") ? 60
    : unit.startsWith("hari") || unit.startsWith("day") ? 1440
    : unit.startsWith("minggu") || unit.startsWith("week") ? 10080
    : unit.startsWith("bulan") || unit.startsWith("month") ? 43200
    : 525600; // tahun
  return n * per;
}

/**
 * Urutkan kartu gabungan PALING BARU dulu lintas source — BUKAN urutan
 * source. Stabil: waktu sama → urutan asal dipertahankan.
 */
export function sortByFresh<T extends Pick<MangaCard, "updatedAt" | "updatedAtTs">>(cards: T[]): T[] {
  const now = Date.now();
  // Timestamp absolut menang (presisi detik — beberapa kartu sering berbagi
  // label menit yang sama, dan urutan mentah source bisa menaruh komik baru
  // di luar 15 kartu yang tampil). Label relatif jadi cadangan.
  const ageMinutes = (c: T): number => {
    const ts = c.updatedAtTs;
    if (typeof ts === "number" && Number.isFinite(ts)) return Math.max(0, (now - ts) / 60_000);
    return updatedAtMinutes(c.updatedAt);
  };
  return cards
    .map((c, i) => ({ c, i, age: ageMinutes(c) }))
    .sort((a, b) => a.age - b.age || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * Nomor chapter dari label ("Chapter 23" → 23, "88-1" → 88.1).
 * NaN bila tak terparse — dipakai merge kartu & detail (satu definisi).
 */
export function chapterNum(label?: string): number {
  if (!label) return NaN;
  const k = normalizeChapterKey(label);
  const n = parseFloat(k.replace(/-(\d+)$/, ".$1"));
  return Number.isFinite(n) ? n : NaN;
}

/* ------------------------------------------------------------------ */
/* Merge detail + chapter                                               */
/* ------------------------------------------------------------------ */

/**
 * Gabungkan detail dari beberapa source. Field teks = Shinigami bila ada,
 * fallback Komiku bila kosong. Genres = gabungan unik per slug/nama.
 * Chapters digabung per nomor chapter ternormalisasi (lihat mergeChapters).
 * Slug tampilan = slug Komiku bila ada, else ID Shinigami.
 */
export function mergeDetails(details: Partial<Record<ComicSourceId, MangaDetail>>): MergedMangaDetail | null {
  const present = SOURCE_PRIORITY.filter((s) => details[s]);
  if (present.length === 0) return null;
  const primary = details[present[0]]!;

  const slugs: Partial<Record<ComicSourceId, string>> = {};
  for (const s of present) slugs[s] = details[s]!.slug;
  const displaySlug = details.komiku?.slug ?? details.komikcast?.slug ?? primary.slug;

  const get = <K extends keyof MangaDetail>(k: K): MangaDetail[K] | undefined => {
    for (const s of SOURCE_PRIORITY) {
      const v = details[s]?.[k];
      if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
    }
    return undefined;
  };

  // Genres: gabung unik (kunci = slug lowercased, fallback nama).
  const seen = new Set<string>();
  const genres: GenreRef[] = [];
  for (const s of SOURCE_PRIORITY) {
    for (const g of details[s]?.genres ?? []) {
      const key = (g.slug || g.name).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        genres.push(g);
      }
    }
  }

  const chapters = mergeChapters(
    Object.fromEntries(present.map((s) => [s, details[s]!.chapters])) as Partial<Record<ComicSourceId, ChapterItem[]>>,
    displaySlug,
  );

  const firstCh: ChapterRef | undefined = get("firstChapter");
  // latestChapter lintas source: nomor TERTINGGI menang — SAMA seperti
  // mergeCards. Nomor sama → Shinigami menang (urutan SOURCE_PRIORITY).
  let latestCh: ChapterRef | undefined = get("latestChapter");
  {
    let best = chapterNum(latestCh?.label);
    if (Number.isFinite(best)) {
      for (const s of SOURCE_PRIORITY) {
        const cand = details[s]?.latestChapter;
        const n = chapterNum(cand?.label);
        if (cand && Number.isFinite(n) && n > best) {
          best = n;
          latestCh = cand;
        }
      }
    }
  }

  return {
    slug: displaySlug,
    title: (get("title") as string) ?? primary.title,
    ...(get("altTitle") ? { altTitle: get("altTitle") as string } : {}),
    cover: (get("cover") as string) ?? primary.cover,
    synopsis: (get("synopsis") as string) ?? "",
    ...(get("type") ? { type: get("type") as string } : {}),
    ...(get("theme") ? { theme: get("theme") as string } : {}),
    genres,
    ...(get("author") ? { author: get("author") as string } : {}),
    ...(get("status") ? { status: get("status") as string } : {}),
    ...(get("rating") ? { rating: get("rating") as string } : {}),
    ...(get("readingDirection") ? { readingDirection: get("readingDirection") as string } : {}),
    ...(firstCh ? { firstChapter: rewriteShiniUrl(firstCh, displaySlug) } : {}),
    ...(latestCh ? { latestChapter: rewriteShiniUrl(latestCh, displaySlug) } : {}),
    chapters,
    sources: present,
    sourceSlug: slugs,
  };
}

/**
 * Gabungkan daftar chapter lintas source. Kunci = nomor ternormalisasi
 * ("Chapter 224" Komiku & "Chapter 224" Shinigami → "224").
 * Aturan per chapter (Shinigami selalu menang bila nomor sama):
 * chapter ada di Shinigami → pakai URL Shinigami; hanya nomor yang
 * tidak ada di Shinigami yang memakai URL Komiku (fallback pelengkap).
 * Label tampilan = dari source prioritas. Urutan = nomor chapter tertinggi
 * dulu lintas source. Nomor tak terparse → fallback urutan daftar Shinigami.
 */
export function mergeChapters(
  lists: Partial<Record<ComicSourceId, ChapterItem[]>>,
  displaySlug: string,
): MergedChapterItem[] {
  const byKey = new Map<string, MergedChapterItem>();
  for (const s of SOURCE_PRIORITY) {
    for (const c of lists[s] ?? []) {
      const key = normalizeChapterKey(c.title);
      if (!key) continue;
      const url = s === "shinigami" ? shiniChapterUrl(displaySlug, c.url) : c.url;
      const cid = s === "shinigami" ? c.chapterId : undefined;
      const ex = byKey.get(key);
      if (ex) {
        if (!ex.sources.some((r) => r.source === s)) {
          ex.sources.push({ source: s, url: c.url, ...(cid ? { chapterId: cid } : {}) });
        } else if (cid) {
          // Slot source sudah ada tapi belum bawa chapterId — lengkapi.
          const slot = ex.sources.find((r) => r.source === s)!;
          if (!slot.chapterId) slot.chapterId = cid;
        }
      } else {
        byKey.set(key, {
          title: c.title,
          url,
          ...(c.date ? { date: c.date } : {}),
          sources: [{ source: s, url: c.url, ...(cid ? { chapterId: cid } : {}) }],
        });
      }
    }
  }
  // Urutan lintas source: nomor chapter TERTINGGI dulu. Tie → Shinigami
  // dulu (urutan sources[0]).
  const primaryList = lists[SOURCE_PRIORITY[0]] ?? [];
  const primaryKeys = primaryList.map((c) => normalizeChapterKey(c.title)).filter(Boolean);
  const order = new Map<string, number>();
  primaryKeys.forEach((k, i) => {
    if (!order.has(k)) order.set(k, i);
  });
  const numOf = (k: string) => {
    const n = parseFloat(k.replace(/-(\d+)$/, ".$1"));
    return Number.isFinite(n) ? n : NaN;
  };
  return [...byKey.values()].sort((a, b) => {
    const ka = normalizeChapterKey(a.title);
    const kb = normalizeChapterKey(b.title);
    const na = numOf(ka);
    const nb = numOf(kb);
    // Keduanya terparse → nomor tertinggi dulu; tie → Shinigami dulu
    // (urutan sources[0]).
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if ((nb as number) !== (na as number)) return (nb as number) - (na as number);
      const sa = a.sources[0]?.source ?? "";
      const sb = b.sources[0]?.source ?? "";
      if (sa !== sb) return SOURCE_PRIORITY.indexOf(sa as never) - SOURCE_PRIORITY.indexOf(sb as never);
      return ka.localeCompare(kb);
    }
    const oa = order.get(ka);
    const ob = order.get(kb);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return ka.localeCompare(kb);
  });
}

/**
 * URL chapter Shinigami selalu ditulis ulang ke displaySlug
 * (`/<uuid>-chapter-N/` → `/<displaySlug>-chapter-N/`) agar route /baca
 * valid. URL non-UUID (sudah displaySlug) dibiarkan.
 */
function shiniChapterUrl(displaySlug: string, url: string): string {
  const m = url.match(/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-chapter-(.+?)\/?$/i);
  if (!m) return url;
  return `/${displaySlug}-chapter-${m[1]}/`;
}

/* ------------------------------------------------------------------ */
/* Parallel fetch dengan partial failure                                */
/* ------------------------------------------------------------------ */

/**
 * Jalankan fetch tiap source paralel; source yang gagal → [] / null +
 * log server, source sukses tetap dipakai. TIDAK pernah throw bila
 * minimal satu source berhasil.
 */
export async function fetchAllSettled<T>(
  jobs: Partial<Record<ComicSourceId, () => Promise<T>>>,
  label: string,
): Promise<{ data: Partial<Record<ComicSourceId, T>>; errors: Partial<Record<ComicSourceId, string>> }> {
  const entries = Object.entries(jobs) as [ComicSourceId, () => Promise<T>][];
  const settled = await Promise.all(
    entries.map(async ([source, fn]) => {
      try {
        return { source, value: await fn(), err: null as unknown, msg: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[aggregator:${label}] source=${source} gagal: ${msg}`);
        return { source, value: null as T | null, err: e, msg };
      }
    }),
  );
  const data: Partial<Record<ComicSourceId, T>> = {};
  const errors: Partial<Record<ComicSourceId, string>> = {};
  for (const { source, value, msg } of settled) {
    if (value !== null) data[source] = value;
    else errors[source] = msg ?? "unknown";
  }
  if (Object.keys(data).length === 0) {
    // Semua gagal — lempar error asli source pertama (mis. KomikuError
    // + status HTTP) agar route mengembalikan status yang sama seperti
    // sebelum agregator ada. Fallback bila tidak ada error asli.
    const firstErr = settled.map((s) => s.err).find((e) => e instanceof Error);
    throw (
      firstErr ??
      new Error(
        entries.length > 1
          ? "Semua sumber data gagal dimuat. Coba lagi."
          : (errors[entries[0]?.[0] ?? "komiku"] ?? "Gagal memuat data."),
      )
    );
  }
  return { data, errors };
}
