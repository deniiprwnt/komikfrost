"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, peekApiCache, prefetchApi } from "@/lib/client";
import { getHistoryEntry, saveHistory } from "@/lib/history";
import { usePageTitle } from "@/lib/page-title";
import type { ChapterData, MangaDetail } from "@/lib/api/types";
import { Comments } from "@/components/comments";
import { chapterPathToRoute } from "@/components/cards";
import { ErrorState } from "@/components/states";
import { ReaderPageImage, ReaderPageError } from "@/components/cover-image";
import { Select } from "@/components/select";
import { ReaderSkeleton } from "@/components/skeletons";
import { ZoomMenu, type ZoomControl } from "@/components/zoom-menu";
import { TocMenu, type TocControl } from "@/components/toc-menu";

function IconChevron({ dir, className }: { dir: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconList({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 19V5m0 0l-6 6m6-6l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Rentang ukuran gambar pembaca (%). 100 = pas lebar kolom bacaan. */
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
/** Langkah slider (%): per 1%. Tombol −/+ melangkah 10 dan dirapikan ke kelipatan 10. */
const ZOOM_SLIDER_STEP = 1;
const ZOOM_PRESETS = [75, 100, 150, 200];

/** Hitung href Prev/Next chapter — dipakai nav atas/bawah + overlay tap. */
function navHrefs(
  data: ChapterData | null,
  slug: string,
  chapter: string,
): { prevHref: string | null; nextHref: string | null } {
  const toNum = (c: string) => parseFloat(c.replace(/-(\d+)$/, ".$1"));
  const cur = toNum(chapter);
  const prevHref = data?.prevUrl ? chapterPathToRoute(data.prevUrl) : null;
  // Hanya tebak +1 untuk chapter BULAT. Chapter desimal (mis. 11-9) tanpa
  // nextUrl dari server dibiarkan null - dulu jatuh ke `String(11.9 + 1)
  // .replace(".", "-") = "12-9"` yang salah (bukan 11-10 maupun 12).
  const nextHref = data?.nextUrl
    ? chapterPathToRoute(data.nextUrl)
    : !data?.prevUrl && Number.isFinite(cur) && Number.isInteger(cur)
      ? `/baca/${slug}/${cur + 1}`
      : null;
  return { prevHref, nextHref };
}

function ChapterNav({
  data,
  slug,
  chapter,
  floating = false,
  zoom,
  zoomPlacement = "top",
  toc,
}: {
  data: ChapterData | null;
  slug: string;
  chapter: string;
  /** true = versi melayang (overlay tap); false = bar statis di alur halaman. */
  floating?: boolean;
  /** Bila diisi, tombol zoom (stepper + slider) tampil di antara Daftar isi dan Next. */
  zoom?: ZoomControl;
  /** Arah buka menu zoom: "top" ke atas nav, "bottom" ke bawah nav. */
  zoomPlacement?: "top" | "bottom";
  /** Bila diisi, "Daftar isi" membuka modal daftar chapter (bukan pindah ke halaman detail). */
  toc?: TocControl;
}) {
  // nextUrl akurat dari server (daftar chapter). Bila absen (gagal scrape
  // daftar / chapter terbaru), tebak +1 seperti sebelumnya.
  const { prevHref, nextHref } = navHrefs(data, slug, chapter);

  const base =
    "group relative flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold select-none transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.97] sm:h-12 sm:gap-2 sm:px-6 sm:text-sm";
  const ghost = `${base} border border-line bg-white text-fg hover:border-accent/60 hover:bg-accent-soft hover:text-accent-strong dark:border-line-dark dark:bg-ink-3/70 dark:text-fg-dark dark:hover:border-accent/60 dark:hover:bg-accent/10 dark:hover:text-white`;
  const primary = `${base} bg-accent text-white hover:bg-accent-strong`;
  const off = `${base} cursor-not-allowed border border-line/70 text-muted/50 active:scale-100 dark:border-line-dark/50 dark:text-muted-dark/45`;

  return (
    <nav
      aria-label="Navigasi chapter"
      className={`relative mx-auto grid w-full min-w-0 ${
        zoom ? "grid-cols-[1fr_auto_auto_1fr]" : "grid-cols-[1fr_auto_1fr]"
      } items-center gap-1.5 rounded-2xl border border-line bg-paper-2 p-1.5 sm:gap-2 sm:p-2 dark:border-line-dark dark:bg-ink-2 ${
        floating
          ? "max-w-md shadow-[0_12px_28px_-14px_rgba(8,28,32,0.4)] sm:max-w-lg dark:shadow-[0_12px_28px_-14px_rgba(0,0,0,0.85)]"
          : "max-w-md sm:max-w-lg"
      }`}
    >
      {prevHref ? (
        <Link href={prevHref} className={ghost}>
          <IconChevron dir="left" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
          <span className="truncate">Prev</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>
          <IconChevron dir="left" className="h-4 w-4 shrink-0" />
          <span className="truncate">Prev</span>
        </span>
      )}

      {toc ? (
        <TocMenu toc={toc} placement={zoomPlacement} />
      ) : (
        <Link
          href={`/komik/${slug}`}
          aria-label="Daftar isi"
          title="Daftar isi"
          className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl text-muted transition-[background-color,color,transform] duration-200 hover:bg-paper-3 hover:text-fg active:scale-95 dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark sm:h-12 sm:w-auto sm:px-4 sm:text-sm sm:font-medium"
        >
          <IconList className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden sm:inline">Daftar isi</span>
        </Link>
      )}

      {zoom && <ZoomMenu zoom={zoom} placement={zoomPlacement} />}

      {nextHref ? (
        <Link href={nextHref} className={primary}>
          <span className="truncate">Next</span>
          <IconChevron dir="right" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <span aria-disabled="true" className={off}>
          <span className="truncate">Next</span>
          <IconChevron dir="right" className="h-4 w-4 shrink-0" />
        </span>
      )}
    </nav>
  );
}

export default function ReaderPage({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  // Bar progres — ditulis langsung ke DOM lewat ref (bukan state) supaya
  // scroll tidak memicu re-render komponen reader (dan seluruh daftar
  // gambarnya) di setiap frame.
  const progressRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  // Progres terakhir yang sudah tersimpan — ditulis ulang hanya saat
  // melewati kelipatan 10% agar tidak menulis localStorage tiap scroll.
  const savedProgressRef = useRef(0);
  // Indeks gambar 0-based terakhir terlihat (untuk persist posisi halaman).
  const pageNumRef = useRef(0);
  // Mode baca: "scroll" (semua halaman memanjang) atau "page" (satu per satu).
  const [mode, setMode] = useState<"scroll" | "page">("scroll");
  const [pageIdx, setPageIdx] = useState(0);
  // Dropdown pindah chapter: daftar dari cache detail (hasil prefetch kartu).
  const [chapters, setChapters] = useState<MangaDetail["chapters"] | null>(null);
  // Restore posisi sekali per chapter (mode scroll: rasio scroll, mode page:
  // indeks halaman). Diambil dari riwayat sebelum overwrite persist awal.
  const restoredRef = useRef("");
  const [restorePct, setRestorePct] = useState<number | null>(null);
  // Penanda persist-awal sudah jalan untuk chapter ini (efek jalan ulang
  // saat restore selesai / mode diganti — persist 0 hanya sekali).
  const initPersistRef = useRef("");
  // Overlay navigasi chapter (Prev / Daftar isi / Next) — muncul saat gambar
  // di-tap (mobile) atau tombol daftar ditekan. Auto-sembunyi 6 detik.
  const [showTapNav, setShowTapNav] = useState(false);
  // Timer auto-sembunyi overlay — disimpan di ref agar tap beruntun
  // me-reset timer lama (tidak menumpuk) dan dibersihkan saat unmount
  // agar tidak ada setState ke komponen yang sudah dilepas.
  const tapNavTimerRef = useRef(0);
  // Tombol kembali-ke-atas — muncul setelah user scroll cukup jauh.
  const [showTop, setShowTop] = useState(false);
  // Tombol kembali-ke-atas: panah naik saja, tanpa Prev/Next.
  // Sembunyikan tombol setelah diklik: tanpa ini tombol tetap terlihat
  // selama animasi smooth-scroll (terasa nyangkut).
  const [fabSuppressed, setFabSuppressed] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  // Ukuran gambar (%). 100 = selebar kolom bacaan; >100 menggulir mendatar,
  // <100 memperkecil gambar di tengah. Tersimpan per perangkat.
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bk-reader-mode");
      if (saved === "page" || saved === "scroll") setMode(saved);
    } catch {
      // abaikan — default scroll
    }
    try {
      const z = Number(localStorage.getItem("bk-reader-zoom"));
      if (Number.isFinite(z) && z >= ZOOM_MIN && z <= ZOOM_MAX) setZoom(Math.round(z));
    } catch {
      // abaikan — default 100%
    }
  }, []);

  // Titik tengah layar (rasio terhadap tinggi daftar gambar) sebelum zoom
  // berubah — dipulihkan di useLayoutEffect agar bacaan tidak "loncat".
  const zoomAnchorRef = useRef<number | null>(null);
  // Menu zoom sedang terbuka: overlay tap-nav tidak boleh auto-sembunyi.
  const zoomMenuOpenRef = useRef(false);
  // Versi state-nya: tombol melayang (kembali-ke-atas, chapter berikut) disembunyikan
  // selama menu terbuka supaya tidak menimpa popover.
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const applyZoom = (v: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v)));
    if (next === zoom) return;
    const el = pagesRef.current;
    if (el && el.offsetHeight > 0) {
      const r = el.getBoundingClientRect();
      zoomAnchorRef.current = Math.min(1, Math.max(0, (window.innerHeight / 2 - r.top) / r.height));
    }
    setZoom(next);
    try {
      localStorage.setItem("bk-reader-zoom", String(next));
    } catch {
      // abaikan
    }
  };

  /** Geser 10% ke atas/bawah, dirapikan ke kelipatan 10; berhenti di ujung. */
  const stepZoom = (d: -1 | 1) => {
    const snapped = d > 0 ? Math.floor(zoom / 10) * 10 + 10 : Math.ceil(zoom / 10) * 10 - 10;
    applyZoom(snapped);
  };

  // Pulihkan posisi baca (mode scroll) setelah layout memakai ukuran baru.
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    const el = pagesRef.current;
    if (a === null || !el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top + a * el.offsetHeight - window.innerHeight / 2) });
  }, [zoom]);

  // Tap-nav auto-sembunyi 6 detik — ditunda selama menu zoom terbuka.
  const armTapNavTimer = () => {
    if (tapNavTimerRef.current) window.clearTimeout(tapNavTimerRef.current);
    tapNavTimerRef.current = window.setTimeout(() => {
      if (!zoomMenuOpenRef.current) setShowTapNav(false);
    }, 6000);
  };

  // Dipakai bersama oleh menu Settings dan modal Daftar isi: selama salah satu
  // terbuka, overlay tap-nav tidak auto-sembunyi dan tombol melayang disembunyikan.
  const onMenuOpenChange = (open: boolean) => {
    zoomMenuOpenRef.current = open;
    setZoomMenuOpen(open);
    if (open) {
      if (tapNavTimerRef.current) window.clearTimeout(tapNavTimerRef.current);
      tapNavTimerRef.current = 0;
    } else {
      // Menu ditutup: beri waktu baca lagi sebelum overlay hilang.
      armTapNavTimer();
    }
  };

  const zoomControl: ZoomControl = {
    value: zoom,
    min: ZOOM_MIN,
    max: ZOOM_MAX,
    step: ZOOM_SLIDER_STEP,
    presets: ZOOM_PRESETS,
    onChange: applyZoom,
    onOpenChange: onMenuOpenChange,
  };

  const switchMode = (m: "scroll" | "page") => {
    setMode(m);
    try {
      localStorage.setItem("bk-reader-mode", m);
    } catch {
      // abaikan
    }
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setData(null);
    setFailed(new Set());
    setPageIdx(0);
    setProgress(0);
    setShowTapNav(false);
    setShowTop(false);
    setRestorePct(null);
    setChapters(null);
    setFabSuppressed(false);
    pageNumRef.current = 0;
    savedProgressRef.current = 0;
    // Posisi tersimpan chapter ini (bila dibuka ulang) — dibaca SEBELUM
    // persist awal menimpanya; restore dilakukan sekali setelah gambar siap.
    const prev = getHistoryEntry(slug);
    const sameChapter = prev && prev.chapter === chapter;
    const savedPage =
      sameChapter && typeof prev.page === "number" && prev.page >= 0 ? prev.page : 0;
    const savedPct =
      sameChapter && prev.progress > 0 && prev.progress < 1 ? prev.progress : null;
    try {
      setData(
        await apiGet<ChapterData>(
          `/api/chapter/${encodeURIComponent(slug)}/${encodeURIComponent(chapter)}`,
          { signal },
        ),
      );
      // Daftar chapter untuk dropdown: dari cache detail bila ada
      // (hasil hover-prefetch kartu / kunjungan halaman detail),
      // kalau tidak ada fetch ringan di background (lihat effect di bawah).
      const cached = peekApiCache<MangaDetail>(`/api/manga/${encodeURIComponent(slug)}`);
      // Panaskan next chapter SAJA dari daftar (spek: current → next, bukan
      // next+1/prev — hemat request). Data JSON-nya masuk cache apiGet reuse.
      if (cached) {
        setChapters(cached.chapters);
        const idx = cached.chapters.findIndex((c) =>
          c.url.includes(`-chapter-${chapter}/`),
        );
        const tok = cached.chapters[idx - 1]?.url.match(/-chapter-(.+?)\/?$/)?.[1];
        if (tok) {
          prefetchApi(
            `/api/chapter/${encodeURIComponent(slug)}/${encodeURIComponent(tok)}`,
          );
        }
      }
      const key = `${slug}/${chapter}`;
      if (restoredRef.current !== key && (savedPage > 0 || savedPct !== null)) {
        restoredRef.current = key;
        setPageIdx(savedPage);
        pageNumRef.current = savedPage;
        setRestorePct(savedPct);
      } else {
        window.scrollTo({ top: 0 });
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Gagal memuat chapter.");
    }
  }, [slug, chapter]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

    // Judul tab: judul chapter apa adanya (sudah memuat nama komik + nomor).
    usePageTitle(data ? data.title : null);

  // Panaskan chapter berikutnya selagi user membaca — tombol Next terasa instan.
  // Data JSON masuk cache apiGet (reuse saat klik Next, tanpa request ganda).
  // Gambar pertama ikut di-preload agar render lebih cepat, kecuali koneksi
  // hemat (saveData/2g) — di situ cukup metadata. Gagal = diam, Next normal.
  useEffect(() => {
    if (!data?.nextUrl) {
      if (!data) return;
      const toNum = (c: string) => parseFloat(c.replace(/-(\d+)$/, ".$1"));
      const cur = toNum(chapter);
      // Sama seperti navHrefs: hanya tebak +1 untuk chapter BULAT.
      // Chapter desimal (mis. 11.9) dulu menjadi "12-9" (salah) dan memicu
      // prefetch ke endpoint 404 yang membuang satu request.
      if (!data.prevUrl && Number.isFinite(cur) && Number.isInteger(cur)) {
        const next = String(cur + 1);
        prefetchApi(`/api/chapter/${encodeURIComponent(data.mangaSlug)}/${encodeURIComponent(next)}`);
      }
      return;
    }
    const tok =
      chapterPathToRoute(data.nextUrl).split("/").pop() ?? "";
    if (!tok) return;
    const path = `/api/chapter/${encodeURIComponent(data.mangaSlug)}/${encodeURIComponent(tok)}`;
    prefetchApi(path);
    // Preload gambar pertama next chapter setelah datanya tiba (cache hit =
    // tanpa request ganda). Hemat koneksi: lewati bila saveData/2g.
    let cancelled = false;
    apiGet<ChapterData>(path)
      .then((d) => {
        if (cancelled || !d.images[0]) return;
        try {
          const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
          if (conn?.saveData || conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return;
        } catch {
          // abaikan — lanjut preload
        }
        const img = new Image();
        img.decoding = "async";
        img.src = d.images[0];
      })
      .catch(() => {
        // prefetch boleh gagal diam-diam
      });
    return () => {
      cancelled = true;
    };
  }, [data, chapter]);

  // Dropdown chapter: bila dibuka langsung (tanpa lewat detail/kartu),
  // cache kosong — ambil daftar dari server di background, 1 request.
  // Gagal = dropdown tidak tampil, navigasi Prev/Next tetap jalan.
  useEffect(() => {
    if (!data || chapters !== null) return;
    let cancelled = false;
    apiGet<MangaDetail>(`/api/manga/${encodeURIComponent(data.mangaSlug)}`)
      .then((d) => {
        if (!cancelled) setChapters(d.chapters);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data, chapters]);

  // Progress bar bacaan — mengikuti posisi scroll relatif terhadap tinggi halaman gambar.
  // Progres riwayat ditulis ulang tiap melewati kelipatan 10%.
  // Di mode "page", progres = posisi halaman (hal 1/N … N/N).
  useEffect(() => {
    if (!data) return;
    // Cover diambil dari cache detail bila tersedia (hasil hover-prefetch
    // kartu) — tanpa request tambahan agar tidak memperlambat reader.
    const cachedDetail = peekApiCache<MangaDetail>(
      `/api/manga/${encodeURIComponent(data.mangaSlug)}`,
    );
    // Bila title chapter hanya "Chapter N" (tanpa nama komik), pakai judul dari
    // cache detail — jangan simpan "Chapter N" sebagai judul komik di riwayat.
    const baseTitle =
      data.title.replace(/\s*chapter\s*.+$/i, "").trim() || cachedDetail?.title || data.title;
    const cover = cachedDetail?.cover ?? "";
    const persist = (pct: number, page: number) => {
      saveHistory({
        slug: data.mangaSlug,
        title: baseTitle,
        cover,
        type: cachedDetail?.type,
        sources: cachedDetail?.sources,
        chapter,
        chapterLabel: data.chapterLabel,
        route: `/baca/${data.mangaSlug}/${chapter}`,
        progress: pct,
        page,
      });
    };
    if (mode === "page") {
      const pct = data.images.length <= 1 ? 1 : pageIdx / (data.images.length - 1);
      savedProgressRef.current = pct;
      pageNumRef.current = pageIdx;
      if (progressRef.current) progressRef.current.style.width = `${pct * 100}%`;
      persist(pct, pageIdx);
      return;
    }
    // Catat riwayat begitu chapter berhasil dimuat — hormati posisi
    // tersimpan (buka ulang): jangan timpa dengan 0 bila ada restore.
    // Guard per chapter karena efek jalan ulang saat restore selesai.
    const initKey = `${data.mangaSlug}/${chapter}`;
    if (initPersistRef.current !== initKey) {
      initPersistRef.current = initKey;
      const startPage = pageNumRef.current;
      if (startPage === 0 && restorePct === null) {
        savedProgressRef.current = 0;
        persist(0, 0);
      } else {
        const pct = restorePct ?? 0;
        savedProgressRef.current = Math.floor(pct * 10) / 10;
        if (progressRef.current) progressRef.current.style.width = `${pct * 100}%`;
      }
    }
    // Restore scroll sekali setelah gambar ter-render (2 frame agar
    // tinggi kontainer sudah final, baru lompat tanpa animasi).
    // Listener scroll tetap dipasang di bawah agar persist berjalan.
    let restoreTimer = 0;
    let hasRestoreTimer = false;
    if (restorePct !== null) {
      const target = restorePct;
      hasRestoreTimer = true;
      restoreTimer = window.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = pagesRef.current;
            if (el) {
              const total = el.offsetHeight - window.innerHeight;
              if (total > 0) window.scrollTo({ top: Math.round(total * target) });
            }
            setRestorePct(null);
          });
        });
      }, 350);
    }
    const onScroll = () => {
      const el = pagesRef.current;
      if (!el) return;
      // Tombol kembali-ke-atas: tampil setelah 600px agar tidak mengganggu awal baca.
      setShowTop(window.scrollY > 600);
      // Mentok atas/bawah → paksa sembunyikan overlay tap-nav karena nav
      // permanen (ChapterNav) sudah terlihat di posisi itu.
      const doc = document.documentElement;
      const atTop = window.scrollY <= 8;
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 8;
      if ((atTop || atBottom) && !zoomMenuOpenRef.current) setShowTapNav(false);
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = -rect.top;
      const pct = total <= 0 ? 1 : Math.min(1, Math.max(0, scrolled / total));
      // Update progress bar via ref (tanpa re-render tiap frame) — state
      // hanya di-sync bila berubah ≥0.5% agar render hemat; React bail-out
      // bila nilai sama sehingga daftar gambar tidak dirender ulang.
      if (progressRef.current) {
        progressRef.current.style.width = `${pct * 100}%`;
      }
      setProgress((prev) => (Math.abs(prev - pct) < 0.005 ? prev : pct));
      // Indeks gambar teratas ditangani IntersectionObserver di bawah —
      // dulu tiap event scroll memanggil getBoundingClientRect() untuk
      // SEMUA gambar (chapter panjang 100+ gambar = layout thrash).
      // Simpan hanya saat melewati batas 10% berikutnya.
      if (pct - savedProgressRef.current >= 0.1 || pct >= 1) {
        savedProgressRef.current = pct >= 1 ? 1 : Math.floor(pct * 10) / 10;
        persist(savedProgressRef.current, pageNumRef.current);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Halaman teratas yang terlihat dihitung observer (satu kali pasang,
    // nol getBoundingClientRect per frame). Dipakai "lanjutkan di halaman
    // yang sama" saat chapter dibuka ulang.
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.pg);
          if (!Number.isFinite(idx)) continue;
          if (e.isIntersecting) visible.add(idx);
          else visible.delete(idx);
        }
        if (visible.size > 0) pageNumRef.current = Math.min(...visible);
      },
      { threshold: 0 },
    );
    pagesRef.current?.querySelectorAll<HTMLElement>("[data-pg]").forEach((n) => io.observe(n));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      if (hasRestoreTimer) window.clearTimeout(restoreTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mode, pageIdx]);

  // Timer overlay wajib dibersihkan saat pindah/unmount chapter — tanpa ini
  // timeout 6 detik bisa memicu setState ke komponen yang sudah dilepas.
  // HARUS di atas return kondisional: hook setelah early return bikin
  // React error #310 (jumlah hook berubah antar render).
  useEffect(() => {
    return () => {
      if (tapNavTimerRef.current) window.clearTimeout(tapNavTimerRef.current);
    };
  }, []);

  // Tombol kembali-ke-atas melayang: mode scroll tampil setelah gulir,
  // mode page selalu tampil kecuali baru saja ditekan (fabSuppressed).
  const fabVisible =
    !zoomMenuOpen && (mode === "page" ? !fabSuppressed : showTop && !fabSuppressed);
  // Setelah tombol panah men-scroll ke atas, tombol disembunyikan.
  // Munculkan lagi saat user benar-benar menggulir (wheel/touchmove) atau
  // berpindah halaman di mode halaman (pageIdx berubah) - bukan sekadar tap
  // pada tombol yang barusan disembunyikan itu sendiri.
  useEffect(() => {
    if (!fabSuppressed) return;
    const reset = () => setFabSuppressed(false);
    window.addEventListener("wheel", reset, { passive: true });
    window.addEventListener("touchmove", reset, { passive: true });
    return () => {
      window.removeEventListener("wheel", reset);
      window.removeEventListener("touchmove", reset);
    };
  }, [fabSuppressed]);
  useEffect(() => {
    // Pindah halaman di mode page = niat navigasi, tampilkan kembali.
    if (mode === "page" && fabSuppressed) setFabSuppressed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx]);

  if (error) return <ErrorState message={error} onRetry={() => load()} />;
  if (!data) return <ReaderSkeleton />;

  const tocControl: TocControl = {
    chapters,
    current: chapter,
    slug: data.mangaSlug,
    onOpenChange: onMenuOpenChange,
  };

  const massFailure = data.images.length > 0 && (failed.size / data.images.length) >= 0.5;

  // Tap gambar (mode scroll): toggle overlay navigasi; sembunyikan otomatis
  // setelah 6 detik agar tidak menutupi bacaan. Tidak dimunculkan saat
  // mentok paling atas / bawah karena ChapterNav permanen sudah terlihat.
  const tapNav = () => {
    const doc = document.documentElement;
    const atTop = window.scrollY <= 8;
    const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 8;
    if (atTop || atBottom) return;
    setShowTapNav((v) => {
      if (!v) {
        // Reset timer lama agar tap beruntun tidak menumpuk timeout
        // yang saling berlomba menyembunyikan overlay prematur.
        armTapNavTimer();
      } else if (tapNavTimerRef.current) {
        window.clearTimeout(tapNavTimerRef.current);
        tapNavTimerRef.current = 0;
      }
      return !v;
    });
  };

  const { nextHref } = navHrefs(data, data.mangaSlug, chapter);
  // Dekat akhir konten: nav permanen di alur halaman sudah terlihat.
  const nearEnd =
    mode === "page" ? pageIdx >= data.images.length - 1 : progress >= 0.97;
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // Tombol "Chapter berikut" mengambang — tampil saat hampir tamat agar
  // tidak perlu scroll ke nav bawah: scroll ≥95% (belum mentok, karena
  // nav permanen sudah terlihat di 100%) atau halaman terakhir mode page.
  // Disembunyikan saat overlay tap-nav tampil (slot bawah yang sama).
  const showNextFloat =
    !zoomMenuOpen &&
    Boolean(nextHref) &&
    (mode === "page"
      ? pageIdx >= data.images.length - 1
      : progress >= 0.95 && progress < 1 && !showTapNav);

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2.5 sm:gap-3 2xl:max-w-4xl">
      <div className="sticky top-[var(--header-h)] z-30 -mx-3 h-1 bg-line sm:-mx-4 dark:bg-line-dark">
        <div
          ref={progressRef}
          className="reader-progress h-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="min-w-0">
        <Link
          href={`/komik/${data.mangaSlug}`}
          className="block max-w-full truncate text-xs text-muted hover:text-accent dark:text-muted-dark"
        >
          ← {data.mangaSlug.replace(/-/g, " ")}
        </Link>
        <h1 className="mt-1 min-w-0 break-words font-display text-base font-bold leading-tight tracking-[-0.01em] text-fg min-[420px]:text-lg sm:text-xl dark:text-fg-dark">
          {data.title}
        </h1>
        {/* Kontrol baca: mode + ukuran gambar — keduanya tersimpan per perangkat. */}
        <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Mode baca"
            className="flex shrink-0 rounded-xl border border-line bg-paper-2 p-1 text-xs font-semibold shadow-sm dark:border-line-dark dark:bg-ink-2"
          >
            {(["scroll", "page"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`touch-manipulation rounded-lg px-3.5 py-1.5 transition-colors ${
                  mode === m
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
                }`}
              >
                {m === "scroll" ? "Scroll" : "Halaman"}
              </button>
            ))}
          </div>

          {/* Zoom: − / persen (klik = kembali ke 100%) / + */}
          <div
            role="group"
            aria-label="Ukuran gambar"
            className="flex shrink-0 items-center rounded-xl border border-line bg-paper-2 p-1 text-xs font-semibold shadow-sm dark:border-line-dark dark:bg-ink-2"
          >
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              disabled={zoom === ZOOM_MIN}
              aria-label="Perkecil gambar"
              title="Perkecil gambar"
              className="flex h-8 w-9 touch-manipulation items-center justify-center rounded-lg text-base text-muted transition-colors hover:bg-paper-3 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => applyZoom(100)}
              aria-label={`Ukuran gambar ${zoom} persen — kembalikan ke 100 persen`}
              title="Kembalikan ke 100%"
              className={`h-8 min-w-12 touch-manipulation rounded-lg px-2 text-center tabular-nums transition-colors ${
                zoom === 100
                  ? "text-muted dark:text-muted-dark"
                  : "text-accent-strong dark:text-accent"
              }`}
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={() => stepZoom(1)}
              disabled={zoom === ZOOM_MAX}
              aria-label="Perbesar gambar"
              title="Perbesar gambar"
              className="flex h-8 w-9 touch-manipulation items-center justify-center rounded-lg text-base text-muted transition-colors hover:bg-paper-3 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <ChapterNav
        data={data}
        slug={data.mangaSlug}
        chapter={chapter}
        zoom={zoomControl}
        zoomPlacement="bottom"
        toc={tocControl}
      />

      {/* Pindah chapter tanpa balik ke detail — daftar dari cache detail,
          dimuat di background bila cache kosong (lihat effect di bawah). */}
      {chapters !== null && chapters.length > 1 && (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm dark:border-line-dark dark:bg-ink-2">
          <span className="shrink-0 text-xs font-semibold text-muted dark:text-muted-dark">
            Chapter
          </span>
          <Select
            value={chapter}
            onChange={(tok) => {
              if (tok && tok !== chapter) router.push(`/baca/${data.mangaSlug}/${tok}`);
            }}
            label="Pindah chapter"
            highlightActive={false}
            searchFrom={8}
            className="flex-1"
            options={chapters.flatMap((c) => {
              const tok = c.url.match(/-chapter-(.+?)\/?$/)?.[1] ?? "";
              return tok ? [{ value: tok, label: c.title, hint: c.date || undefined }] : [];
            })}
          />
        </div>
      )}

      {massFailure && (
        <div
          role="status"
          aria-live="polite"
          className="fade-rise flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm dark:border-line-dark dark:bg-ink-2"
        >
          <p className="min-w-0 flex-1 text-muted dark:text-muted-dark">
            {failed.size} dari {data.images.length} halaman gagal dimuat.
          </p>
          <button
            type="button"
            onClick={() => load()}
            className="min-h-11 shrink-0 touch-manipulation rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white active:scale-[0.97]"
          >
            Muat ulang
          </button>
        </div>
      )}

      {mode === "scroll" ? (
        <div className={`min-w-0 ${zoom > 100 ? "overflow-x-auto" : ""}`}>
          <div
            ref={pagesRef}
            className="mx-auto flex min-w-0 flex-col overflow-hidden rounded-lg bg-paper-3 min-[420px]:rounded-xl dark:bg-black"
            style={zoom === 100 ? undefined : { width: `${zoom}%` }}
          >
            {data.images.map((src, i) =>
              failed.has(i) ? (
                <ReaderPageError
                  key={i}
                  index={i}
                  onRetry={() =>
                    setFailed((s) => {
                      const n = new Set(s);
                      n.delete(i);
                      return n;
                    })
                  }
                />
              ) : (
                <ReaderPageImage
                  key={i}
                  src={src}
                  alt={`${data.title} halaman ${i + 1}`}
                  index={i}
                  priority={i < 2}
                  onFail={() => setFailed((s) => new Set(s).add(i))}
                  onClick={tapNav}
                  imgClassName="block w-full cursor-pointer select-none"
                />
              ),
            )}
          </div>
        </div>
      ) : (
        <PageMode
          data={data}
          pageIdx={pageIdx}
          setPageIdx={setPageIdx}
          failed={failed}
          setFailed={setFailed}
          zoom={zoom}
        />
      )}

      <ChapterNav data={data} slug={data.mangaSlug} chapter={chapter} zoom={zoomControl} toc={tocControl} />

      {/* Komentar chapter dari 3 sumber — dimuat malas, di bawah nav. */}
      <Comments key={`${slug}/${chapter}`} slug={slug} chapter={chapter} />

      {/* Overlay tap: Prev / Daftar isi / Next — muncul saat gambar di-tap.
          Tab bar disembunyikan saat membaca, jadi cukup 1rem + safe-area dari bawah. */}
      {mode === "scroll" && showTapNav && (
        <div className="float-in fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 sm:bottom-6">
          <ChapterNav data={data} slug={data.mangaSlug} chapter={chapter} floating zoom={zoomControl} toc={tocControl} />
        </div>
      )}

      {/* Tombol "Chapter berikut" mengambang — muncul saat hampir tamat
          agar tidak perlu scroll balik ke nav bawah. Link biasa (bukan
          auto-pindah): tetap user yang memutuskan. */}
      {showNextFloat && nextHref && (
        <div className="float-in fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 sm:bottom-24">
          <Link
            href={nextHref}
            className="mx-auto flex w-full max-w-3xl touch-manipulation items-center justify-center gap-1.5 rounded-2xl bg-accent px-4 py-3.5 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Chapter berikut
            <IconChevron dir="right" className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      )}

      {/* Tombol kembali-ke-atas melayang. Klik = langsung gulir ke atas,
          lalu tombol disembunyikan agar tidak nyangkut selama animasi. */}
      {fabVisible && (
        <div
          ref={fabRef}
          className={`fab-in fixed right-3 z-40 flex flex-col items-end gap-2 transition-[bottom] duration-500 sm:right-8 ${
            mode === "scroll" && showTapNav
              ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:bottom-[6.75rem]"
              : showNextFloat
                ? "bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-[10rem]"
                : nearEnd
                  ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-[5.5rem]"
                  : "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setFabSuppressed(true);
              scrollTop();
            }}
            aria-label="Kembali ke atas"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border border-accent bg-accent text-white transition-[background-color,border-color,transform] duration-200 hover:border-accent-strong hover:bg-accent-strong active:scale-95"
          >
            <IconUp className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Mode halaman tunggal: satu gambar per layar + tap kiri/kanan + keyboard. */
function PageMode({
  data,
  pageIdx,
  setPageIdx,
  failed,
  setFailed,
  zoom,
}: {
  data: ChapterData;
  pageIdx: number;
  setPageIdx: (i: number | ((p: number) => number)) => void;
  failed: Set<number>;
  setFailed: (f: Set<number> | ((s: Set<number>) => Set<number>)) => void;
  /** Ukuran gambar (%) dari kontrol zoom pembaca. */
  zoom: number;
}) {
  const total = data.images.length;
  const cur = total === 0 ? 0 : Math.min(Math.max(0, pageIdx), total - 1);

  const go = useCallback(
    (d: number) => {
      setPageIdx((p) => {
        const n = Math.min(Math.max(0, p + d), Math.max(0, total - 1));
        if (n !== p) window.scrollTo({ top: 0 });
        return n;
      });
    },
    [setPageIdx, total],
  );

  // Keyboard: panah kanan/spasi = maju, panah kiri = mundur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Jangan bajak ketikan/aktivasi keyboard di elemen interaktif. Kotak
      // cari dropdown chapter di-portal ke <body>, jadi event-nya tetap
      // menggelembung ke window — tanpa penjagaan ini spasi tidak bisa
      // diketik dan tombol tidak bisa diaktifkan dengan keyboard.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable], button, a")) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const src = total === 0 ? undefined : data.images[cur];
  const isFailed = total === 0 || failed.has(cur) || !src;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0 overflow-hidden rounded-lg bg-paper-3 min-[420px]:rounded-xl dark:bg-black">
        {total === 0 ? (
          <ReaderPageError index={0} message="Chapter ini tidak memiliki gambar yang bisa ditampilkan." />
        ) : isFailed ? (
          <ReaderPageError
            index={cur}
            onRetry={() =>
              setFailed((s) => {
                const n = new Set(s);
                n.delete(cur);
                return n;
              })
            }
          />
        ) : (
          // Zoom >100%: gambar melebihi layar, jadi wadahnya jadi scroller
          // dua arah (geser untuk melihat bagian lain). Zona tap tetap di
          // luar scroller agar tidak ikut tergulir.
          <div className={zoom > 100 ? "max-h-[78vh] overflow-auto" : "overflow-hidden"}>
            <div key={cur} className="fade-soft mx-auto" style={zoom === 100 ? undefined : { width: `${zoom}%` }}>
              <ReaderPageImage
                src={src}
                alt={`${data.title} halaman ${cur + 1}`}
                index={cur}
                priority={cur === 0}
                mode="page"
                onFail={() => setFailed((s) => new Set(s).add(cur))}
                imgClassName={
                  zoom > 100
                    ? "block w-full select-none"
                    : "block max-h-[75vh] w-full select-none object-contain"
                }
              />
            </div>
          </div>
        )}
        {/* Zona tap: kiri 1/3 mundur, kanan 2/3 maju */}
        {!isFailed && (
          <>
            <button
              aria-label="Halaman sebelumnya"
              onClick={() => go(-1)}
              className="absolute inset-y-0 left-0 w-1/3 touch-manipulation"
            />
            <button
              aria-label="Halaman berikutnya"
              onClick={() => go(1)}
              className="absolute inset-y-0 right-0 w-2/3 touch-manipulation"
            />
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => go(-1)}
          disabled={total === 0 || cur === 0}
          className="min-h-11 flex-1 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg disabled:opacity-40 sm:min-h-0 dark:border-line-dark dark:text-fg-dark"
        >
          ← Sebelumnya
        </button>
        <span className="shrink-0 text-xs tabular-nums text-muted dark:text-muted-dark">
          {total === 0 ? "0 / 0" : `${cur + 1} / ${total}`}
        </span>
        <button
          onClick={() => go(1)}
          disabled={total === 0 || cur === total - 1}
          className="min-h-11 flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Berikutnya →
        </button>
      </div>
    </div>
  );
}
