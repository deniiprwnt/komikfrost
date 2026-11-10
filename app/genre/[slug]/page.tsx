"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, titleKey } from "@/lib/client";
import { usePageTitle } from "@/lib/page-title";
import { canonicalGenre } from "@/lib/api/genre-canonical";
import type { MangaCard } from "@/lib/api/types";
import { KomikListCard, KomikListSkeleton } from "@/components/komik-list";
import { GenreDetailRouteSkeleton } from "@/components/route-skeletons";
import { Pagination } from "@/components/pagination";
import { Select } from "@/components/select";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";

interface LatestPayload {
  items: MangaCard[];
  hasNextPage: boolean;
}

const ORDERBYS = [
  { v: "modified", label: "Update" },
  { v: "date", label: "Judul Baru" },
  { v: "popular", label: "Peringkat" },
  { v: "rand", label: "Acak" },
] as const;

type Orderby = (typeof ORDERBYS)[number]["v"];

const TIPES = [
  { v: "", label: "Tipe" },
  { v: "manga", label: "Manga" },
  { v: "manhua", label: "Manhua" },
  { v: "manhwa", label: "Manhwa" },
] as const;

/** Halaman dari URL (?page=N). Default 1. */
function parsePage(raw: string | null | undefined): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) return 1;
  return n;
}

function GenreDetailContent({ slug }: { slug: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  // Nilai awal HANYA dari URL: sessionStorage tidak bisa dibaca di server,
  // jadi membacanya di useState membuat markup server & klien berbeda
  // (hydration mismatch). Nilai tersimpan diterapkan setelah mount.
  const [orderby, setOrderby] = useState<Orderby>(() => {
    const fromUrl = sp?.get("orderby") as Orderby | null;
    return fromUrl && ORDERBYS.some((o) => o.v === fromUrl) ? fromUrl : "modified";
  });
  const [tipe, setTipe] = useState(() => sp?.get("tipe") ?? "");

  // Setelah mount: pulihkan filter terakhir (hanya bila URL tidak menentukan).
  useEffect(() => {
    try {
      if (!sp?.get("orderby")) {
        const saved = sessionStorage.getItem(`bk-genre-${slug}-orderby`) as Orderby | null;
        if (saved && ORDERBYS.some((o) => o.v === saved)) setOrderby(saved);
      }
      if (sp?.get("tipe") === null) {
        const savedTipe = sessionStorage.getItem(`bk-genre-${slug}-tipe`);
        if (savedTipe) setTipe(savedTipe);
      }
    } catch {
      // storage diblokir — pakai default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const filtersKey = `${orderby}|${tipe}`;

  // Satu halaman tampil dalam satu waktu — posisi dibaca dari URL (?page=N)
  // sehingga refresh maupun kembali dari komik langsung membuka halaman
  // yang sama. Keluar lalu masuk lagi tanpa ?page= otomatis mulai dari
  // halaman 1.
  const [page, setPage] = useState<number>(() => parsePage(sp?.get("page")));
  const [items, setItems] = useState<MangaCard[]>([]);
  const [hasNext, setHasNext] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bootedRef = useRef(false);
  // Filter yang sudah diterapkan — perubahan dibanding nilai ini yang
  // memicu reset ke halaman 1. Perbandingan nilai, aman dari
  // double-effect StrictMode.
  const appliedFiltersRef = useRef(filtersKey);
  // Hasil mentah per halaman, per kombinasi filter — sumber dedupe.
  // Dedupe dihitung ulang dari halaman SEBELUMNYA setiap kali diterapkan,
  // jadi membuka ulang halaman mana pun (termasuk halaman 1 lewat pagination
  // atau tombol Back) tidak pernah mengosongkan daftar. Murni client-side.
  const pagesRef = useRef(new Map<string, Map<number, MangaCard[]>>());

  // Saring item yang judulnya sudah tampil di halaman sebelumnya
  // (filter aktif), lalu catat halaman ini. Urutan + prioritas server utuh.
  const dedupePage = useCallback(
    (p: number, list: MangaCard[]): MangaCard[] => {
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
      return out;
    },
    [filtersKey],
  );
  const listTopRef = useRef<HTMLDivElement>(null);

  const buildQs = useCallback(
    (p: number) => {
      // Pakai /api/latest (endpoint /manga/ + ?genre=) agar mendukung
      // orderby + tipe — endpoint /genre/<slug>/ tidak mendukung keduanya.
      const qs = new URLSearchParams({
        genre: slug,
        page: String(p),
        orderby,
      });
      if (tipe) qs.set("tipe", tipe);
      return qs;
    },
    [slug, orderby, tipe],
  );

  const scrollToList = useCallback(() => {
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  // Muat satu halaman penuh (mengganti daftar, bukan menumpuk).
  const loadPage = useCallback(
    async (p: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<LatestPayload>(
          `/api/latest?${buildQs(p)}`,
          signal ? { signal } : undefined,
        );
        setItems(dedupePage(p, res.items));
        setHasNext(res.hasNextPage);
        setPage(p);
      } catch (e) {
        // Dibatalkan (filter/halaman berganti) — bukan kegagalan.
        if (signal?.aborted) return;
        setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [buildQs, dedupePage],
  );

  // Satu request aktif: pindah filter/halaman membatalkan yang lama agar
  // respons lambat tidak menimpa hasil yang lebih baru.
  const reqRef = useRef<AbortController | null>(null);
  const run = useCallback(
    (p: number) => {
      reqRef.current?.abort();
      const ctrl = new AbortController();
      reqRef.current = ctrl;
      void loadPage(p, ctrl.signal);
    },
    [loadPage],
  );
  useEffect(() => () => reqRef.current?.abort(), []);

  // Mount pertama: buka halaman sesuai URL.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    appliedFiltersRef.current = filtersKey;
    pagesRef.current.delete(filtersKey);
    run(parsePage(sp?.get("page")));
    // Reset penanda saat cleanup: StrictMode dev melepas & menjalankan ulang
    // efek, jadi run kedua harus tetap memuat data (bukan tertahan booted).
    return () => {
      bootedRef.current = false;
      reqRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perubahan filter (bukan mount): kembali ke halaman 1.
  useEffect(() => {
    if (appliedFiltersRef.current === filtersKey) return;
    appliedFiltersRef.current = filtersKey;
    // Buang riwayat dedupe HANYA untuk filter baru ini agar mulai bersih.
    pagesRef.current.delete(filtersKey);
    // Batasi jumlah kombinasi filter yang disimpan (maks 20) agar Map
    // tidak tumbuh tanpa batas bila user berganti-ganti filter terus.
    if (pagesRef.current.size > 20) {
      const oldest = pagesRef.current.keys().next().value;
      if (oldest !== undefined && oldest !== filtersKey) pagesRef.current.delete(oldest);
    }
    scrollToList();
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Pindah halaman via pagination.
  const goTo = useCallback(
    (p: number) => {
      const target = Math.min(Math.max(1, p), 50);
      if (target === page || loading) return;
      scrollToList();
      run(target);
    },
    [page, loading, run, scrollToList],
  );

  // Filter + halaman ditulis ke URL (replace, tanpa reload) + sessionStorage
  // per-genre (filter saja) agar tidak reset saat buka komik lalu kembali.
  useEffect(() => {
    if (!bootedRef.current) return;
    const qs = new URLSearchParams();
    if (orderby !== "modified") qs.set("orderby", orderby);
    if (tipe) qs.set("tipe", tipe);
    if (page > 1) qs.set("page", String(page));
    router.replace(qs.size > 0 ? `/genre/${slug}?${qs}` : `/genre/${slug}`, {
      scroll: false,
    });
    try {
      sessionStorage.setItem(`bk-genre-${slug}-orderby`, orderby);
      sessionStorage.setItem(`bk-genre-${slug}-tipe`, tipe);
    } catch {
      // storage diblokir — URL saja sudah cukup
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page]);

  // Judul genre memakai NAMA KANONIS (Inggris) â€” sama dengan chip di halaman
  // detail dan daftar /genre. Slug sumber lama ("romansa", "fiksi-sains")
  // tidak lagi tampil sebagai judul hasil title-case slug.
  const canon = canonicalGenre(slug);
  const title = canon?.name ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  usePageTitle(`Genre: ${title}`);

  return (
    <div ref={listTopRef} className="flex min-w-0 scroll-mt-[calc(var(--header-h)+0.5rem)] flex-col gap-3 sm:gap-4">
      <SectionHead title={`Genre: ${title}`} />
      <div className="filter-row">
        <Select
          value={orderby}
          onChange={(v) => setOrderby(v as Orderby)}
          label="Urutkan daftar"
          options={ORDERBYS.map((o) => ({ value: o.v, label: o.label }))}
        />
        <Select
          value={tipe}
          onChange={setTipe}
          label="Filter tipe komik"
          options={TIPES.map((t) => ({ value: t.v, label: t.label }))}
        />
      </div>

      {loading && <KomikListSkeleton count={8} />}
      {error && <ErrorState message={error} onRetry={() => run(page)} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState message={`Tidak ada komik genre "${title}" dari sumber data.`} />
      )}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="stagger flex min-w-0 flex-col gap-3">
            {items.map((item) => (
              <KomikListCard key={`${item.slug}#${item.latestChapter?.url ?? ""}`} item={item} />
            ))}
          </div>
          <Pagination page={page} hasNext={hasNext} pending={loading} onChange={goTo} />
        </>
      )}
    </div>
  );
}

export default function GenreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense fallback={<GenreDetailRouteSkeleton />}>
      <GenreDetailContent slug={slug} />
    </Suspense>
  );
}
