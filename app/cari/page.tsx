"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, titleKey } from "@/lib/client";
import { usePageTitle } from "@/lib/page-title";
import type { MangaCard } from "@/lib/api/types";
import { SectionHead, ErrorState, EmptyState } from "@/components/states";
import { CariRouteSkeleton } from "@/components/route-skeletons";
import { KomikListCard, KomikListSkeleton } from "@/components/komik-list";
import { Pagination } from "@/components/pagination";
import { SearchSuggest } from "@/components/search-suggest";

interface SearchPayload {
  keyword: string;
  items: MangaCard[];
  hasNextPage: boolean;
  /** Jumlah judul hasil gabungan halaman ini (sebelum dipotong). */
  total?: number;
}

/** Halaman dari URL (?page=N). Default 1. */
function parsePage(raw: string | null | undefined): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) return 1;
  return n;
}

function CariContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = (sp?.get("q") || "").trim();
  usePageTitle(q ? `Cari: ${q}` : "Pencarian");
  const [draft, setDraft] = useState(q);
  const [page, setPage] = useState<number>(() => parsePage(sp?.get("page")));
  const [items, setItems] = useState<MangaCard[] | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootedRef = useRef(false);
  const appliedQRef = useRef(q);
  const listTopRef = useRef<HTMLDivElement>(null);
  // Hasil mentah per halaman, per kata kunci — sumber dedupe lintas-halaman
  // (merge server hanya per-page; judul yang sama bisa muncul di p1 dari satu
  // source dan p2 dari source lain karena beda timing).
  // Dedupe dihitung ulang dari halaman SEBELUMNYA setiap kali diterapkan,
  // jadi membuka ulang halaman mana pun (termasuk lewat tombol Back) tidak
  // pernah mengosongkan daftar. Murni client-side, tanpa request tambahan.
  const pagesRef = useRef(new Map<string, Map<number, MangaCard[]>>());
  // Apakah halaman 1 kata kunci ini punya jawaban exact (bukan "hasil mirip").
  // Menentukan apakah halaman lanjutan diminta strict (tanpa fallback mirip).
  const p1ExactRef = useRef(new Map<string, boolean>());

  // Saring item yang judulnya sudah tampil di halaman sebelumnya
  // (kata kunci aktif), lalu catat halaman ini. Urutan + prioritas server utuh.
  const dedupePage = useCallback(
    (kw: string, p: number, list: MangaCard[]): MangaCard[] => {
      let pages = pagesRef.current.get(kw);
      if (!pages) {
        // Cap memori: maksimal 20 kata kunci tersimpan, hapus yang terlama.
        if (pagesRef.current.size >= 20) {
          const oldest = pagesRef.current.keys().next().value;
          if (oldest !== undefined) pagesRef.current.delete(oldest);
        }
        pages = new Map();
        pagesRef.current.set(kw, pages);
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
    [],
  );

  useEffect(() => setDraft(q), [q]);

  const scrollToList = useCallback(() => {
    requestAnimationFrame(() => {
      listTopRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  // Muat satu halaman penuh (mengganti daftar, bukan menumpuk).
  // Duplikat lintas-halaman dibuang via pagesRef per kata kunci.
  const loadPage = useCallback(async (kw: string, p: number, signal?: AbortSignal) => {
    if (!kw) {
      setItems([]);
      setHasNext(false);
      setTotal(null);
      return;
    }
    setLoading(true);
    setError(null);
    setItems(null);
    setTotal(null);
    try {
      const res = await apiGet<SearchPayload>(
        `/api/search?q=${encodeURIComponent(kw)}&page=${p}`,
        signal ? { signal } : undefined,
      );
      const fresh = dedupePage(kw, p, res.items);
      setItems(fresh);
      // Jumlah hasil dari server; tidak pernah lebih kecil dari kartu yang
      // benar-benar tampil (dedupe lintas-halaman hanya mengurangi daftar).
      setTotal(Math.max(typeof res.total === "number" ? res.total : 0, fresh.length));
      setPage(p);
      if (p === 1) {
        // Halaman 1 exact = ada kartu bukan "hasil mirip".
        p1ExactRef.current.set(kw, res.items.some((c) => c.exactMatch !== false));
      }
      // Halaman 1 punya jawaban exact tapi server klaim ada lanjutannya:
      // cek diam-diam halaman 2 — bila tidak ada judul exact BARU (belum
      // tampil di halaman 1), pagination dimatikan agar tidak ada tombol
      // sesat ke halaman tanpa jawaban. Pengecekan hanya mengintip (tanpa
      // mencatat ke pagesRef) agar halaman 2 asli tetap utuh saat user
      // benar-benar membukanya. P1 murni "hasil mirip" tidak dicek
      // (pilihannya memang berlanjut). +1 request diam-diam.
      if (p === 1 && p1ExactRef.current.get(kw) === true && res.hasNextPage) {
        setHasNext(true);
        try {
          const next = await apiGet<SearchPayload>(
            `/api/search?q=${encodeURIComponent(kw)}&page=2`,
            signal ? { signal } : undefined,
          );
          const p1Keys = new Set<string>();
          for (const it of pagesRef.current.get(kw)?.get(1) ?? []) {
            const k = titleKey(it.title);
            if (k) p1Keys.add(k);
          }
          const unseenExact = next.items.filter((c) => {
            if (c.exactMatch === false) return false;
            const k = titleKey(c.title);
            return !k || !p1Keys.has(k);
          });
          if (unseenExact.length === 0) setHasNext(false);
        } catch {
          // Cek gagal = biarkan pagination apa adanya.
        }
      } else {
        setHasNext(res.hasNextPage);
      }
    } catch (e) {
      // Dibatalkan efek (kata kunci berganti) — bukan kegagalan.
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : "Gagal memuat data.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dedupePage]);

  // Mount pertama: buka halaman sesuai URL.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    appliedQRef.current = q;
    const ctrl = new AbortController();
    void loadPage(q, parsePage(sp?.get("page")), ctrl.signal);
    // Reset penanda saat cleanup: StrictMode dev melepas & menjalankan ulang
    // efek, jadi run kedua harus tetap memuat data.
    return () => {
      ctrl.abort();
      bootedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kata kunci berubah (bukan mount): kembali ke halaman 1.
  useEffect(() => {
    if (appliedQRef.current === q) return;
    appliedQRef.current = q;
    scrollToList();
    const ctrl = new AbortController();
    void loadPage(q, 1, ctrl.signal);
    return () => {
      ctrl.abort();
      appliedQRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Pindah halaman via pagination (URL ditulis agar bertahan saat refresh).
  const goTo = useCallback(
    (p: number) => {
      const target = Math.min(Math.max(1, p), 50);
      if (target === page || loading) return;
      scrollToList();
      const qs = new URLSearchParams({ q });
      if (target > 1) qs.set("page", String(target));
      router.replace(`/cari?${qs}`, { scroll: false });
      void loadPage(q, target);
    },
    [page, loading, loadPage, scrollToList, q, router],
  );

  // Pencarian langsung: ketik → 400 ms setelah berhenti, URL mengikuti
  // (replace, tanpa menumpuk history) dan hasil dimuat otomatis. Tombol
  // "Cari" / Enter tetap jalan seperti biasa (langsung, tanpa nunggu).
  const submit = useCallback(() => {
    if (draft.trim()) router.push(`/cari?q=${encodeURIComponent(draft.trim())}`);
  }, [draft, router]);
  useEffect(() => {
    const t = draft.trim();
    if (!t || t === q) return;
    const id = window.setTimeout(() => router.replace(`/cari?q=${encodeURIComponent(t)}`), 400);
    return () => window.clearTimeout(id);
  }, [draft, q, router]);

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <SectionHead title="Pencarian" />
      <form
        role="search"
        className="search-wrap relative flex w-full min-w-0 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="cari-q" className="sr-only">Cari judul komik</label>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          className="pointer-events-none absolute left-3.5 z-10 h-[18px] w-[18px] text-muted sm:left-4 sm:h-5 sm:w-5 dark:text-muted-dark"
        >
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m20 20-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <SearchSuggest
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          id="cari-q"
          autoFocus
          enabled={false}
          inputClassName="search-field h-12 w-full min-w-0 rounded-xl border border-line bg-paper-2 pl-11 pr-4 text-base text-fg outline-none placeholder:text-muted sm:h-14 sm:pl-12 sm:pr-5 sm:text-base dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
        />
      </form>

      <div ref={listTopRef} className="scroll-mt-[calc(var(--header-h)+0.5rem)]">
        {q && (
          <p className="truncate text-sm text-muted dark:text-muted-dark">
            Hasil untuk &quot;{q}&quot;
            {page > 1 && `, halaman ${page}`}
          </p>
        )}
      </div>
      {!q && <EmptyState message="Ketik judul komik pada kolom pencarian di atas." />}
      {q && loading && <KomikListSkeleton count={8} />}
      {error && <ErrorState message={error} onRetry={() => loadPage(q, page)} />}
      {!loading && !error && items && q && items.length === 0 && (
        <div className="flex min-w-0 flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-semibold text-fg dark:text-fg-dark">
            Tidak ada hasil untuk &quot;{q}&quot;.
          </p>
          <ul className="max-w-xs list-none space-y-1 text-xs leading-relaxed text-muted dark:text-muted-dark">
            <li>Coba 1 kata saja (mis. judul tanpa angka).</li>
            <li>Periksa ejaan: beda 1 huruf bisa nihil hasil.</li>
            <li>Coba judul Inggris/alternatifnya.</li>
          </ul>
        </div>
      )}
      {!loading && !error && items && items.length > 0 && (
        <>
          <p className="-mt-1 text-xs text-muted sm:text-sm dark:text-muted-dark">
            Ditemukan {total ?? items.length} judul
          </p>
          <div className="stagger flex min-w-0 flex-col gap-3">
            {items.map((item, idx) => (
              <div key={`${item.slug}#${item.latestChapter?.url ?? ""}`}>
                {item.exactMatch === false &&
                  (idx === 0 || items[idx - 1]?.exactMatch !== false) && (
                    <p className="px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted dark:text-muted-dark">
                      Hasil mirip (tidak ada judul yang memuat semua kata kunci)
                    </p>
                  )}
                <KomikListCard item={item} />
              </div>
            ))}
          </div>
          <div className="mt-3 sm:mt-4">
            <Pagination page={page} hasNext={hasNext} pending={loading} onChange={goTo} />
          </div>
        </>
      )}
    </div>
  );
}

export default function CariPage() {
  return (
    <Suspense fallback={<CariRouteSkeleton />}>
      <CariContent />
    </Suspense>
  );
}
