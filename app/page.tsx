"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiGetSWR, invalidateApi, peekApiCache, prefetchApi, readApiSnapshot } from "@/lib/client";
import { timeAgo, useHistory } from "@/lib/history";
import type { ComicSourceId, MangaCard } from "@/lib/api/types";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";
import { RankListSkeleton, LatestGridSkeleton, RailSkeleton } from "@/components/skeletons";
import { MangaGridCard, RankRow, SourceBadge, TypeBadge } from "@/components/cards";
import { CoverImage } from "@/components/cover-image";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { cardSig, useNowTick } from "@/lib/relative-time";

/** Acak array (Fisher-Yates) — rekomendasi tampil beda tiap kunjungan. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tanda daftar (SEMUA kartu tampil) — pembanding ringan untuk deteksi
 *  perubahan isi. Dulu hanya 3 teratas: komik baru yang masuk di posisi 4+
 *  tidak pernah tampil sampai halaman dimuat ulang. */
function listSig(list: MangaCard[] | null): string {
  return (list || [])
    .map(cardSig)
    .join("|");
}

interface HomePayload {
  latest: MangaCard[];
  popular: MangaCard[];
  recommended: MangaCard[];
}

/** Buang parameter `live` dari path — pemuatan awal memakai cache server. */
function withoutLive(path: string): string {
  try {
    const u = new URL(path, "http://localhost");
    u.searchParams.delete("live");
    const q = u.searchParams.toString();
    return u.pathname + (q ? `?${q}` : "");
  } catch {
    return path;
  }
}

/**
 * Section beranda: tampil instan dari cache (basi < 5 mnt) lalu segarkan
 * diam-diam — layar tidak pernah kosong menunggu jaringan.
 */
function useHomeSection<K extends keyof HomePayload>(
  key: K,
  shuffleData = false,
  /**
   * Endpoint ringan untuk cek "ada komik baru?". Default /api/home (ikut
   * men-scrape populer + rekomendasi). Daftar terbaru memakai /api/latest
   * agar polling 60 dtk tidak mengulang seluruh kerja beranda.
   */
  probePath?: string,
) {
  // Endpoint khusus section (bila ada) → bentuk payload { items }.
  // `live=1` hanya dipakai probe auto-refresh; pemuatan awal memakai versi
  // ber-cache agar tidak menembak ulang tiga sumber di setiap mount.
  const loadPath = probePath ? withoutLive(probePath) : "/api/home";
  const [data, setData] = useState<MangaCard[] | null>(() => {
    // Cache prefetch dari menu/hover = konten langsung tampil. Rekomendasi
    // dikecualikan: urutannya diacak saat load sehingga memakai cache akan
    // membuat daftar melompat tepat setelah tampil.
    if (shuffleData) return null;
    // Section dengan endpoint sendiri (daftar terbaru) membaca cache
    // endpoint itu, bukan /api/home — dulu isinya tertukar dengan payload
    // /api/home lalu daftar berganti sendiri beberapa detik setelah tampil.
    if (probePath) {
      const cachedProbe = peekApiCache<{ items?: MangaCard[] }>(loadPath);
      return cachedProbe?.items ?? null;
    }
    const cached = peekApiCache<HomePayload>("/api/home");
    return cached ? cached[key] : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Cermin `data !== null` tanpa ikut ke deps `load` — membaca `data`
  // langsung di dalam useCallback menangkap nilai basi (stale closure)
  // sehingga spinner `refreshing` tidak pernah menyala saat muat ulang.
  const hasDataRef = useRef(data !== null);
  // Cermin `data` untuk pengecekan background (hindari stale closure).
  const dataRef = useRef<MangaCard[] | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const load = useCallback(
    async (fresh = false) => {
      setError(null);
      if (hasDataRef.current) setRefreshing(true);
      // Section dengan endpoint sendiri membawa payload { items }, bukan
      // { latest, popular, recommended }.
      const listFrom = (payload: unknown): MangaCard[] | null => {
        if (!payload) return null;
        if (probePath) return (payload as { items?: MangaCard[] }).items ?? null;
        return (payload as HomePayload)[key] ?? null;
      };
      const pick = (payload: unknown, allowShuffle = true) => {
        const list = listFrom(payload);
        if (list) hasDataRef.current = true;
        // Refresh diam-diam (stale-while-revalidate) TIDAK mengocok ulang:
        // rekomendasi yang dikocok ulang di background bikin daftar lompat
        // sendiri saat user sedang membaca. Kocok hanya saat muat foreground.
        return list && shuffleData && allowShuffle ? shuffle(list) : list;
      };
      // Refresh halaman menghapus cache memori: tampilkan snapshot disk
      // dulu supaya beranda tidak kosong menunggu scrape.
      if (!hasDataRef.current && !shuffleData) {
        const snap = readApiSnapshot<HomePayload | { items?: MangaCard[] }>(loadPath);
        const list = listFrom(snap);
        if (list && list.length > 0) {
          hasDataRef.current = true;
          dataRef.current = list;
          setData(list);
        }
      }
      try {
        if (fresh) invalidateApi(loadPath);
        const res = await apiGetSWR<HomePayload | { items?: MangaCard[] }>(
          loadPath,
          (payload) => {
            setData(pick(payload, false));
            setRefreshing(false);
          },
          () => setRefreshing(false),
        );
        setData(pick(res.data));
        // Kalau data basi, onFresh di atas yang mematikan spinner.
        if (!res.stale) setRefreshing(false);
      } catch (e) {
        // Ada isi dari cache/snapshot → biarkan daftar tampil, jangan
        // timpa dengan layar error hanya karena refresh gagal.
        if (!hasDataRef.current) setError(e instanceof Error ? e.message : "Gagal memuat data.");
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, shuffleData, loadPath],
  );
  // Cek diam-diam (auto-refresh PWA): fetch baru, ganti daftar bila ISI
  // daftar berubah (komik/chapter baru di posisi mana pun). Tanpa spinner,
  // tanpa menyentuh error — gagal = abaikan. Rekomendasi (acak) dikecualikan:
  // urutannya memang beda tiap fetch.
  const checkNew = useCallback(async () => {
    if (shuffleData) return;
    if (!dataRef.current || dataRef.current.length === 0) return;
    try {
      const path = probePath ?? "/api/home";
      const payload = await apiGet<HomePayload | { items?: MangaCard[] }>(path, { noStore: true });
      const list = probePath
        ? ((payload as { items?: MangaCard[] }).items ?? null)
        : ((payload as HomePayload | null)?.[key] ?? null);
      if (!list || list.length === 0) return;
      // Probe /api/latest hanya membawa 15 kartu, sedangkan /api/home bisa
      // membawa 40. Bandingkan potongan yang setara agar daftar tidak
      // dianggap berubah hanya karena panjangnya beda.
      const current = probePath ? dataRef.current.slice(0, list.length) : dataRef.current;
      if (listSig(list) === listSig(current)) return;
      hasDataRef.current = true;
      dataRef.current = list;
      setData(list);
    } catch {
      // Abaikan — daftar lama tetap tampil.
    }
  }, [key, shuffleData, probePath]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load, refreshing, checkNew };
}

/**
 * Section Rekomendasi: tampil acak (dikocok) tiap kunjungan — daftar dari
 * server (?orderby=rand) dikocok ulang di browser agar urutannya beda
 * setiap dibuka, walau data server sempat kena cache.
 */
function useRecommended() {
  return useHomeSection("recommended", true);
}

/** Label waktu riwayat yang menua sendiri — komponen terpisah agar detak
 *  1 dtk tidak memicu render ulang seluruh beranda. */
function HistoryTime({ ts }: { ts: number }) {
  const now = useNowTick();
  return <>{timeAgo(ts, now ?? Date.now())}</>;
}

/** Bentuk minimal /api/manga/<slug>?ringkas=1 — cukup untuk badge. */
type HistoryMeta = { type?: string; sources?: ComicSourceId[] };

/**
 * Badge tipe + sumber di kartu "Lanjut membaca". Riwayat lama belum
 * menyimpan tipe/sumber, jadi dilengkapi sekali lewat ringkasan server
 * (1 request, cache 1 jam) — tanpa itu kartu lama tampil polos sampai
 * komiknya dibaca ulang.
 */
function HistoryBadges({ slug, type, sources }: { slug: string; type?: string; sources?: ComicSourceId[] }) {
  const path = `/api/manga/${encodeURIComponent(slug)}?ringkas=1`;
  const [meta, setMeta] = useState<HistoryMeta>({ type, sources });
  const complete = Boolean(meta.type && meta.sources?.length);

  useEffect(() => {
    if (complete) return;
    const cached = peekApiCache<HistoryMeta>(path);
    if (cached) {
      setMeta((m) => ({
        type: m.type ?? cached.type,
        sources: m.sources?.length ? m.sources : cached.sources,
      }));
      if (cached.type && cached.sources?.length) return;
    }
    let off = false;
    apiGet<HistoryMeta>(path)
      .then((d) => {
        if (off || !d) return;
        setMeta((m) => ({ type: m.type ?? d.type, sources: m.sources?.length ? m.sources : d.sources }));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
    // `complete` sengaja abai: efek cukup sekali per slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    // Satu baris badge menempel ke tepi atas cover (sama seperti kartu di
    // halaman lain); pojok mengikuti lengkung kartu via overflow-hidden.
    // Flex + gap: tipe kiri, sumber kanan, sumber menyusut/elipsis bila
    // ruang habis (mis. MANHWA + KOMIKCAST).
    <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-1">
      {meta.type && (
        <div className="flex min-w-0 max-w-[55%] shrink-0 [&>span]:px-1 [&>span]:py-0.5 [&>span]:text-[8px] sm:[&>span]:px-2 sm:[&>span]:py-1 sm:[&>span]:text-[9px]">
          <TypeBadge type={meta.type} flush />
        </div>
      )}
      <SourceBadge
        shrink
        className="ml-auto min-w-0 [&>span]:rounded-none [&>span]:px-1 [&>span]:py-0.5 [&>span]:text-[8px] sm:[&>span]:px-1.5 sm:[&>span]:py-1 sm:[&>span]:text-[9px]"
        sources={meta.sources?.slice(0, 1)}
      />
    </div>
  );
}

export default function HomePage() {
  const { entries: history } = useHistory();
  // 1 request gabungan untuk 3 section (hemat handshake, ramah rate limit).
  const popular = useHomeSection("popular");
  // Daftar terbaru punya endpoint sendiri yang jauh lebih ringan dari
  // /api/home (tanpa scrape populer + rekomendasi).
  // live=1: probe auto-refresh 5 dtk melewati semua cache → komik baru dari
  // Komiku/Komikcast/Shinigami tampil begitu sumbernya terbit.
  const latest = useHomeSection("latest", false, "/api/latest?page=1&orderby=modified&limit=16&live=1");
  const recommended = useRecommended();

  // Daftar update sendiri tiap interval + tiap PWA dibuka lagi — tanpa
  // reload manual. Hanya section terurut (rekomendasi acak dikecualikan
  // di dalam checkNew agar tidak lompat saat dibaca).
  // Peringkat sengaja TIDAK ikut di-poll: perubahannya lambat dan
  // /api/home men-scrape 3 sumber sekaligus (≈5 dtk) — cukup disegarkan
  // saat halaman dibuka atau tombol muat ulang ditekan.
  const checkNewAll = useCallback(() => {
    void latest.checkNew();
  }, [latest.checkNew]);
  // 30 dtk (bukan 5): probe `live` melewati SEMUA cache dan menembak tiga
  // sumber sekaligus — tiap 5 dtk itu ~36 request upstream/menit per tab.
  // Chapter baru tetap terdeteksi maksimal setengah menit setelah terbit.
  useAutoRefresh(checkNewAll, 30_000);

  // Prefetch hemat: hanya daftar genre + hanya saat browser idle, agar
  // tidak berebut bandwidth/CPU dengan gambar + section beranda.
  // Halaman 2 terbaru TIDAK dipanaskan (mubazir bila user tidak ke sana).
  // Mode hemat-data (saveData) = tanpa prefetch sama sekali.
  useEffect(() => {
    const warm = () => {
      try {
        const conn = navigator as Navigator & { connection?: { saveData?: boolean } };
        if (conn.connection?.saveData) return;
      } catch {
        // abaikan — lanjut prefetch
      }
      prefetchApi("/api/genres");
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId = 0;
    let timer = 0;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(warm, { timeout: 6000 });
    } else {
      timer = window.setTimeout(warm, 3000);
    }
    return () => {
      if (idleId) w.cancelIdleCallback?.(idleId);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const anyRefreshing = popular.refreshing || latest.refreshing || recommended.refreshing;

  return (
    <div className="flex min-w-0 flex-col gap-10 sm:gap-14 lg:gap-16">
      {/* Peringkat harian: daftar 1–10, dua kolom di layar lebar (urut ke bawah per kolom) */}
      <section className="min-w-0">
        <div className="mb-1 flex items-end justify-between gap-3 border-b border-line pb-2 dark:border-line-dark">
          <h1 className="display-cond relative min-w-0 flex-1 truncate text-2xl text-fg sm:text-3xl lg:text-4xl dark:text-fg-dark">
            Peringkat harian
            <span aria-hidden className="bar-grow absolute -bottom-[9px] left-0 h-[3px] w-10 bg-accent" />
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => {
                // Popular & rekomendasi dari /api/home; daftar terbaru punya
                // endpoint sendiri sehingga cache-nya terpisah.
                invalidateApi("/api/home");
                invalidateApi("/api/latest");
                popular.load(true);
                latest.load(true);
                recommended.load(true);
              }}
              aria-label="Muat ulang data terbaru"
              title="Muat ulang data terbaru"
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
            >
              <svg className={`h-4 w-4 ${anyRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24">
                <path
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 11a8 8 0 0 0-14.3-4.5M4 4v3.75h3.75M4 13a8 8 0 0 0 14.3 4.5M20 20v-3.75h-3.75"
                />
              </svg>
            </button>
            <Link href="/populer" className="section-link py-1.5 text-xs font-semibold">
              Lihat semua
            </Link>
          </div>
        </div>
        {!popular.data && !popular.error && (
          <div className="mt-3">
            <RankListSkeleton count={10} />
          </div>
        )}
        {popular.error && <ErrorState message={popular.error} onRetry={() => popular.load(true)} />}
        {popular.data && popular.data.length === 0 && (
          <EmptyState message="Belum ada data peringkat dari sumber data." />
        )}
        {popular.data && popular.data.length > 0 && (
          <div className="mt-3 grid gap-2.5 lg:grid-cols-2 lg:gap-3">
            {[popular.data.slice(0, 5), popular.data.slice(5, 10)].map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
                {col.map((item) => (
                  <RankRow key={`${item.slug}#${item.latestChapter?.url ?? ""}`} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Terakhir dibaca — hanya tampil bila ada riwayat di perangkat ini */}
      {history.length > 0 && (
        <section className="min-w-0">
          <SectionHead title="Lanjut membaca" href="/riwayat" />
          <div className="rail-scroll rail-snap -mx-3 -mt-2 flex gap-3 overflow-x-auto px-3 pb-1 pt-2 sm:mx-0 sm:px-0">
            {history.slice(0, 10).map((h) => (
              <div key={h.slug} className="flex w-[112px] shrink-0 sm:w-[132px] lg:w-[148px]">
                <Link
                  href={h.route}
                  className="cv-auto group flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-paper-2 transition-colors duration-200 hover:border-accent/50 dark:border-line-dark dark:bg-ink-2"
                >
                  <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-paper-3 dark:bg-ink-3">
                    <CoverImage
                      src={h.cover}
                      alt={h.title}
                      title={h.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                    <HistoryBadges slug={h.slug} type={h.type} sources={h.sources} />
                    {h.progress > 0 && (
                      <span aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/40">
                        <span className="block h-full bg-accent" style={{ width: `${Math.round(h.progress * 100)}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col px-2.5 pb-2 pt-2.5">
                    <p className="mb-2 line-clamp-2 break-words text-[13px] font-semibold leading-[1.35] tracking-[-0.005em] text-fg group-hover:text-accent dark:text-fg-dark">
                      {h.title}
                    </p>
                    <p className="mt-auto truncate border-t border-line pt-2 text-[11px] leading-tight text-muted dark:border-line-dark dark:text-muted-dark">
                      {h.chapterLabel} · <HistoryTime ts={h.updatedAt} />
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Update terbaru — grid seragam: 12 judul (16 di layar sangat lebar) */}
      <section className="min-w-0">
        <SectionHead title="Update terbaru" href="/terbaru" />
        {!latest.data && !latest.error && <LatestGridSkeleton />}
        {latest.error && <ErrorState message={latest.error} onRetry={() => latest.load(true)} />}
        {latest.data && latest.data.length === 0 && !latest.error && (
          <EmptyState message="Belum ada update dari sumber data." />
        )}
        {latest.data && latest.data.length > 0 && (
          <div className="stagger grid grid-cols-2 gap-x-3 gap-y-5 min-[420px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 lg:gap-y-6 xl:grid-cols-8">
            {latest.data.slice(0, 16).map((item, i) => (
              <div
                key={item.slug + (item.latestChapter?.url || "")}
                className={`min-w-0 ${i >= 12 ? "hidden xl:flex" : "flex"}`}
              >
                <MangaGridCard item={item} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rekomendasi — judul di kolom kiri (desktop), cover berjajar di rail */}
      <section className="grid min-w-0 gap-4 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
          <h2 className="display-cond text-3xl text-fg sm:text-4xl dark:text-fg-dark">
            Rekomendasi
          </h2>
          <span aria-hidden className="mt-2 block h-[3px] w-10 bg-accent" />
          <p className="mt-3 hidden text-sm leading-relaxed text-muted lg:block dark:text-muted-dark">
            Pilihan acak, berganti setiap kamu membuka beranda.
          </p>
          <Link
            href="/terbaru?orderby=rand"
            className="mt-3 hidden w-fit rounded-md bg-accent px-3 py-2 text-xs font-bold text-white hover:bg-accent-strong lg:inline-block"
          >
            Lihat semua
          </Link>
        </div>
        <div className="min-w-0">
          {!recommended.data && !recommended.error && <RailSkeleton />}
          {recommended.error && <ErrorState message={recommended.error} onRetry={() => recommended.load(true)} />}
          {recommended.data && recommended.data.length === 0 && !recommended.error && (
            <EmptyState message="Belum ada rekomendasi dari sumber data." />
          )}
          {recommended.data && recommended.data.length > 0 && (
            <div className="rail-scroll rail-snap -mx-3 -mt-2 flex gap-3 overflow-x-auto px-3 pb-2 pt-2 sm:mx-0 sm:px-0">
              {recommended.data.slice(0, 12).map((item) => (
                <div key={item.slug + (item.latestChapter?.url || "")} className="flex w-[132px] shrink-0 sm:w-[156px] lg:w-[168px]">
                  <MangaGridCard item={item} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
