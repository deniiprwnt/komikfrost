"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiGetSWR, peekApiCacheStale, readApiSnapshot, titleKey } from "@/lib/client";
import { usePageTitle } from "@/lib/page-title";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { cardSig } from "@/lib/relative-time";
import type { GenreRef, MangaCard } from "@/lib/api/types";
import { KomikListCard, KomikListSkeleton } from "@/components/komik-list";
import { Pagination } from "@/components/pagination";
import { Select } from "@/components/select";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";
import { TerbaruSkeleton } from "@/components/skeletons";

interface LatestPayload {
  items: MangaCard[];
  hasNextPage: boolean;
}

const ORDERBYS = [
  { v: "modified", label: "Chapter terbaru" },
  { v: "date", label: "Komik terbaru" },
  { v: "rand", label: "Acak" },
] as const;

type Orderby = (typeof ORDERBYS)[number]["v"];

function parseOrderby(raw: string | null): Orderby {
  return raw === "date" || raw === "rand" ? raw : "modified";
}

/** Halaman dari URL (?page=N). Default 1. */
function parsePage(raw: string | null | undefined): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) return 1;
  return n;
}

const TIPES = [
  { v: "", label: "Semua tipe" },
  { v: "manga", label: "Manga" },
  { v: "manhwa", label: "Manhwa" },
  { v: "manhua", label: "Manhua" },
] as const;

const STATUSES = [
  { v: "", label: "Semua status" },
  { v: "ongoing", label: "Ongoing" },
  { v: "end", label: "Tamat" },
] as const;

/** Ambil nilai awal HANYA dari URL. Masuk /terbaru tanpa parameter
 *  (mis. dari tab Terbaru, "Lihat semua", dsb.) selalu mulai bersih
 *  (default) — bukan memakai filter kunjungan sebelumnya. Filter hanya
 *  bertahan via URL (?orderby=&tipe=&...), mis. saat kembali dari komik
 *  atau refresh yang URL-nya sudah memuat parameter. */
function initParam(sp: URLSearchParams | null, key: string): string {
  return sp?.get(key) ?? "";
}

/**
 * Path API untuk halaman + filter yang sedang ada di URL. Dipakai untuk
 * cache awal/prefetch menu — harus sama persis dengan `buildQs` di bawah.
 */
function latestApiPath(sp: URLSearchParams | null, page: number): string {
  const qs = new URLSearchParams({
    page: String(page),
    orderby: parseOrderby(sp?.get("orderby") ?? null),
  });
  const tipe = initParam(sp, "tipe");
  const status = initParam(sp, "status");
  const genre1 = initParam(sp, "genre");
  const genre2 = initParam(sp, "genre2");
  if (tipe) qs.set("tipe", tipe);
  if (status) qs.set("status", status);
  if (genre1) qs.set("genre", genre1);
  if (genre2) qs.set("genre2", genre2);
  return `/api/latest?${qs}`;
}

function TerbaruContent() {
  const router = useRouter();
  const sp = useSearchParams();
  usePageTitle("Komik Terbaru");

  const [orderby, setOrderby] = useState<Orderby>(() => parseOrderby(sp?.get("orderby") ?? null));
  const [tipe, setTipe] = useState(() => initParam(sp, "tipe"));
  const [status, setStatus] = useState(() => initParam(sp, "status"));
  // Multi-pilih genre: 2 slot (genre + genre2) — HANYA dari URL (deep-link
  // halaman Genre). Masuk /terbaru tanpa ?genre= harus mulai bersih.
  const [genre1, setGenre1] = useState(() => initParam(sp, "genre"));
  const [genre2, setGenre2] = useState(() => initParam(sp, "genre2"));

  const filtersKey = `${orderby}|${tipe}|${status}|${genre1}|${genre2}`;

  // Satu halaman tampil dalam satu waktu — posisi dibaca dari URL (?page=N)
  // sehingga refresh maupun kembali dari komik langsung membuka halaman
  // yang sama. Keluar lalu masuk lagi lewat link /terbaru (tanpa ?page=)
  // otomatis mulai dari halaman 1.
  const [page, setPage] = useState<number>(() => parsePage(sp?.get("page")));
  // Cache prefetch menu (hover/idle) dipakai sebagai isi awal — halaman
  // tujuan langsung tampil, bukan skeleton yang terasa seperti reload.
  const [boot] = useState(() =>
    peekApiCacheStale<LatestPayload>(latestApiPath(sp, parsePage(sp?.get("page")))),
  );
  const [items, setItems] = useState<MangaCard[]>(() => boot?.items ?? []);
  const [hasNext, setHasNext] = useState(() => boot?.hasNextPage ?? false);

  const [genreOpts, setGenreOpts] = useState<GenreRef[]>([]);
  const [loading, setLoading] = useState(() => (boot?.items.length ?? 0) === 0);
  const [error, setError] = useState<string | null>(null);

  const bootedRef = useRef(false);
  // Filter yang sudah diterapkan — perubahan dibanding nilai ini yang
  // memicu reset ke halaman 1. Perbandingan nilai, aman dari
  // double-effect StrictMode.
  const appliedFiltersRef = useRef(filtersKey);
  const listTopRef = useRef<HTMLDivElement>(null);
  // Hasil mentah per halaman, per kombinasi filter — sumber dedupe.
  // Dedupe dihitung ulang dari halaman < p setiap kali diterapkan, jadi
  // menerapkan ulang halaman yang SAMA (data basi lalu data segar dari
  // stale-while-revalidate) tidak pernah mengosongkan daftar. Murni
  // client-side, tanpa request tambahan.
  const pagesRef = useRef(new Map<string, Map<number, MangaCard[]>>());
  // Cermin state untuk pengecekan background (hindari stale closure).
  const itemsRef = useRef<MangaCard[]>([]);
  const pageRef = useRef(page);
  const loadingRef = useRef(loading);
  const filtersKeyRef = useRef(filtersKey);
  useEffect(() => {
    itemsRef.current = items;
    pageRef.current = page;
    loadingRef.current = loading;
    filtersKeyRef.current = filtersKey;
  });

  // Terapkan hasil satu halaman: simpan mentahnya, buang judul yang sudah
  // tampil di halaman SEBELUMNYA (merge server hanya per-page; judul sama
  // bisa muncul di p1 dari satu source dan p2 dari source lain karena beda
  // timing), lalu set state sekaligus. Urutan + prioritas server utuh.
  const applyItems = useCallback(
    (list: MangaCard[], next: boolean, p: number) => {
      let pages = pagesRef.current.get(filtersKey);
      if (!pages) {
        pages = new Map();
        pagesRef.current.set(filtersKey, pages);
      }
      pages.set(p, list);
      const seen = new Set<string>();
      for (const [n, raw] of pages) {
        if (n >= p) continue;
        for (const it of raw) {
          const k = titleKey(it.title);
          if (k) seen.add(k);
        }
      }
      const out: MangaCard[] = [];
      for (const item of list) {
        const k = titleKey(item.title);
        if (k && seen.has(k)) continue;
        out.push(item);
      }
      setItems(out);
      setHasNext(next);
      setPage(p);
    },
    [filtersKey],
  );

  const buildQs = useCallback(
    (p: number) => {
      const qs = new URLSearchParams({ page: String(p), orderby });
      if (tipe) qs.set("tipe", tipe);
      if (status) qs.set("status", status);
      if (genre1) qs.set("genre", genre1);
      if (genre2) qs.set("genre2", genre2);
      return qs;
    },
    [orderby, tipe, status, genre1, genre2],
  );

  // Auto-refresh PWA: cek diam-diam tiap interval, ganti daftar HANYA
  // bila isi daftar berubah (komik/chapter baru di posisi mana pun).
  // Tanpa skeleton, tanpa menyentuh error/loading — gagal = abaikan.
  // Hanya halaman 1 & urutan non-acak (komik baru muncul di halaman 1;
  // mode acak jangan diusik urutannya saat dibaca).
  const silentCheck = useCallback(async () => {
    if (orderby === "rand") return;
    if (pageRef.current !== 1 || loadingRef.current) return;
    const cur = itemsRef.current;
    if (cur.length === 0) return;
    try {
      // live=1: bypass cache memori server + cache HTTP upstream agar daftar
      // benar-benar mengikuti sumber data (Komiku/Komikcast/Shinigami).
      const qs = buildQs(1);
      qs.set("live", "1");
      const res = await apiGet<LatestPayload>(`/api/latest?${qs}`, { noStore: true });
      // Selama await (scrape 2–6 dtk) user bisa sudah pindah halaman.
      // applyItems(..., 1) memanggil setPage(1) — jangan sampai itu
      // menendang user kembali ke halaman 1 dari halaman yang sedang
      // dibuka.
      if (pageRef.current !== 1) return;
      if (!res.items || res.items.length === 0) return;
      // Waktu update ikut dibandingkan (cardSig): chapter sama tapi waktunya
      // dari sumber lain lebih baru harus tetap mengganti daftar.
      // Bandingkan ISI daftar, bukan 3 teratas saja: komik baru yang masuk
      // di posisi 4+ dulu tidak pernah tampil sampai halaman dimuat ulang.
      // Tampilan diacak (acak=1) → urutan hasil probe selalu beda. Bandingkan
      // sebagai himpunan: ganti daftar HANYA bila isinya benar-benar berubah
      // (ada judul/chapter baru), bukan karena urutan acaknya berbeda.
      const sig = (l: MangaCard[]) => l.map(cardSig).sort().join("|");
      if (sig(res.items) === sig(cur)) return;
      applyItems(res.items, res.hasNextPage, 1);
    } catch {
      // Abaikan — daftar lama tetap tampil.
    }
  }, [orderby, buildQs, applyItems]);
  // 30 dtk: probe `live` melewati semua cache & menembak 3 sumber — tiap
  // 5 dtk itu terlalu berat untuk upstream. Update tetap terdeteksi <30 dtk.
  useAutoRefresh(silentCheck, 30_000);

  const scrollToList = useCallback(() => {
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  // Muat satu halaman penuh (mengganti daftar, bukan menumpuk).
  // Mount/back (filter sama): cache basi (<5 mnt) tampil instan +
  // disegarkan diam-diam — kembali dari detail tidak menunggu jaringan.
  // Filter berubah / pagination (fresh): selalu fetch baru.
  const loadPage = useCallback(
    async (p: number, fresh = false, signal?: AbortSignal) => {
      const path = `/api/latest?${buildQs(p)}`;
      // Cache prefetch masih segar → tampilkan isi yang sudah ada tanpa
      // mengganti layar dengan skeleton.
      const cached = !fresh ? peekApiCacheStale<LatestPayload>(path) : null;
      // Refresh halaman menghapus cache memori — snapshot localStorage
      // membuat daftar langsung tampil, lalu disegarkan diam-diam.
      const fromDisk =
        !fresh && !cached?.items?.length ? readApiSnapshot<LatestPayload>(path) : null;
      const shown = cached?.items?.length ? cached : fromDisk?.items?.length ? fromDisk : null;
      setLoading(!shown);
      setError(null);
      if (fromDisk?.items?.length && !cached?.items?.length) {
        applyItems(fromDisk.items, fromDisk.hasNextPage, p);
      }
      try {
        // Halaman 1 harus selalu fresh (live=1) agar data terbaru (misal
        // dari Shinigami) langsung muncul saat di-refresh, tanpa menunggu
        // auto-refresh 30 detik. Ini melewati semua cache server & CDN.
        const qs = buildQs(p);
        const isLive = p === 1;
        if (isLive) qs.set("live", "1");
        const fetchPath = `/api/latest?${qs}`;

        if (fresh || isLive) {
          const res = await apiGet<LatestPayload>(fetchPath, {
            noStore: isLive,
            ...(signal ? { signal } : {}),
          });
          applyItems(res.items, res.hasNextPage, p);
          setLoading(false);
          return;
        }

        const { data } = await apiGetSWR<LatestPayload>(fetchPath, (d) => {
          applyItems(d.items, d.hasNextPage, p);
          setLoading(false);
        });
        if (data) {
          // Data basi pun langsung tampil — jangan tahan di skeleton
          // menunggu refresh background selesai (itu yang membuat
          // halaman terasa lambat padahal datanya sudah ada).
          applyItems(data.items, data.hasNextPage, p);
          setLoading(false);
        }
        // data null = mustahil (apiGet throw bila gagal).
      } catch (e) {
        // Dibatalkan efek (filter berganti) — bukan kegagalan.
        if (signal?.aborted) return;
        // Sudah ada isi (cache/snapshot) → jangan ganti layar dengan error;
        // daftar lama tetap terbaca, refresh bisa dicoba lagi nanti.
        if (!shown) setError(e instanceof Error ? e.message : "Gagal memuat data.");
        setLoading(false);
      }
    },
    [buildQs, applyItems],
  );

  // Mount pertama: buka halaman sesuai URL (cache basi tampil instan).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    appliedFiltersRef.current = filtersKey;
    void loadPage(parsePage(sp?.get("page")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kembali ke /terbaru lewat navigasi client (pathname sama, mount tidak
  // terjadi, mis. klik menu "Terbaru" saat filter sedang aktif): sinkronkan
  // state dengan URL supaya filter lama tidak bocor. Bila filters berubah,
  // effect [filtersKey] di bawah yang memuat ulang halaman 1.
  const spKey = sp?.toString() ?? "";
  useEffect(() => {
    if (!bootedRef.current) return;
    const nextOrderby = parseOrderby(sp?.get("orderby") ?? null);
    const nextTipe = initParam(sp, "tipe");
    const nextStatus = initParam(sp, "status");
    const nextGenre1 = initParam(sp, "genre");
    const nextGenre2 = initParam(sp, "genre2");
    const nextFilters = `${nextOrderby}|${nextTipe}|${nextStatus}|${nextGenre1}|${nextGenre2}`;
    if (nextFilters === filtersKey) return;
    setOrderby(nextOrderby);
    setTipe(nextTipe);
    setStatus(nextStatus);
    setGenre1(nextGenre1);
    setGenre2(nextGenre2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  // Perubahan filter (bukan mount): kembali ke halaman 1 (selalu fresh).
  useEffect(() => {
    if (appliedFiltersRef.current === filtersKey) return;
    appliedFiltersRef.current = filtersKey;
    // Batasi memori dedupe lintas-halaman: buang riwayat filter lama.
    if (pagesRef.current.size > 20) pagesRef.current.clear();
    scrollToList();
    const ctrl = new AbortController();
    void loadPage(1, true, ctrl.signal);
    // Reset penanda saat cleanup: StrictMode dev melepas & menjalankan ulang
    // efek, jadi run kedua harus tetap memuat data.
    return () => {
      ctrl.abort();
      appliedFiltersRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Pindah halaman via pagination.
  const goTo = useCallback(
    (p: number) => {
      const target = Math.min(Math.max(1, p), 50);
      if (target === page || loading) return;
      // Sinkron: `pageRef` dipakai silentCheck untuk memutuskan apakah
      // hasil fetch yang sedang in-flight masih relevan. Efek mirror
      // (useEffect di bawah) baru jalan SETELAH render — jendela kecil
      // yang cukup untuk auto-refresh menimpa halaman baru dengan data
      // halaman 1.
      pageRef.current = target;
      scrollToList();
      void loadPage(target);
    },
    [page, loading, loadPage, scrollToList],
  );

  // Filter + halaman ditulis ke URL (replace, tanpa reload) agar bertahan
  // saat kembali dari komik maupun refresh. TIDAK disimpan ke sessionStorage:
  // masuk /terbaru tanpa parameter harus selalu mulai bersih.
  useEffect(() => {
    if (!bootedRef.current) return;
    const qs = new URLSearchParams();
    if (orderby !== "modified") qs.set("orderby", orderby);
    if (tipe) qs.set("tipe", tipe);
    if (status) qs.set("status", status);
    if (genre1) qs.set("genre", genre1);
    if (genre2) qs.set("genre2", genre2);
    if (page > 1) qs.set("page", String(page));
    const target = qs.size > 0 ? `/terbaru?${qs}` : "/terbaru";
    router.replace(target, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page]);

  // Opsi genre untuk dropdown (sekali muat, 1 jam cache server).
  // Ditunda sebentar: scrape genre ikut berebut upstream dengan daftar
  // utama saat halaman baru dibuka — daftar komik yang harus menang.
  useEffect(() => {
    let off = false;
    const timer = window.setTimeout(() => {
      apiGet<GenreRef[]>("/api/genres")
        .then((opts) => {
          if (!off) setGenreOpts(opts);
        })
        .catch(() => {
          if (!off) setGenreOpts([]);
        });
    }, 1500);
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <section className="min-w-0 rounded-2xl border border-line bg-paper-2 p-3 sm:p-4 dark:border-line-dark dark:bg-ink-2">
        <div ref={listTopRef} className="scroll-mt-[calc(var(--header-h)+0.5rem)]">
          <SectionHead title="Komik Terbaru" />
        </div>
        <div className="filter-row">
          <Select
            value={orderby}
            onChange={(v) => setOrderby(parseOrderby(v))}
            label="Urutkan daftar"
            options={ORDERBYS.map((o) => ({ value: o.v, label: o.label }))}
          />
          <Select
            value={tipe}
            onChange={setTipe}
            label="Filter tipe komik"
            options={TIPES.map((t) => ({ value: t.v, label: t.label }))}
          />
          <Select
            value={status}
            onChange={setStatus}
            label="Filter status komik"
            options={STATUSES.map((s) => ({ value: s.v, label: s.label }))}
          />
          <Select
            value={genre1}
            onChange={(v) => {
              setGenre1(v);
              if (v && v === genre2) setGenre2("");
            }}
            label="Filter genre pertama"
            options={[
              { value: "", label: "Genre" },
              ...genreOpts.map((g) => ({ value: g.slug, label: g.name, disabled: g.slug === genre2 && genre2 !== "" })),
            ]}
          />
          <Select
            value={genre2}
            onChange={setGenre2}
            label="Filter genre kedua"
            options={[
              { value: "", label: "+ Genre" },
              ...genreOpts.map((g) => ({ value: g.slug, label: g.name, disabled: g.slug === genre1 && genre1 !== "" })),
            ]}
          />
        </div>

      {loading && (
        <div className="mt-3 sm:mt-4">
          <KomikListSkeleton count={8} />
        </div>
      )}
      {error && <ErrorState message={error} onRetry={() => loadPage(page)} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState className="mt-3 sm:mt-4" message="Tidak ada komik dari sumber data untuk filter ini." />
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="stagger mt-3 flex min-w-0 flex-col gap-3 sm:mt-4">
            {items.map((item) => (
              <KomikListCard key={`${item.slug}#${item.latestChapter?.url ?? ""}`} item={item} />
            ))}
          </div>
          <div className="mt-3 sm:mt-4">
            <Pagination page={page} hasNext={hasNext} pending={loading} onChange={goTo} />
          </div>
        </>
      )}
      </section>
    </div>
  );
}

export default function TerbaruPage() {
  return (
    <Suspense fallback={<TerbaruSkeleton />}>
      <TerbaruContent />
    </Suspense>
  );
}
