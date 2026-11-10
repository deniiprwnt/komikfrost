/**
 * Skeleton bersama — SATU sumber untuk `loading.tsx` (skeleton route) dan
 * halaman itu sendiri (skeleton saat data belum datang). Karena keduanya
 * memakai komponen yang sama, pergantian skeleton → skeleton tidak terlihat
 * dan tidak ada lompatan layout saat data masuk.
 *
 * Aturan: setiap skeleton mencerminkan struktur ASLI (kelas pembungkus,
 * padding, ukuran cover, jumlah kolom) dan memakai judul section yang
 * sungguhan (bukan balok abu-abu), karena judulnya sudah pasti.
 *
 * Tanpa "use client" → aman dipakai dari server component (loading.tsx).
 * Yang butuh hook (useParams / useSearchParams) ada di route-skeletons.tsx.
 */
import { SectionHead } from "@/components/states";
import { KomikListSkeleton } from "@/components/komik-list";

/* Daftar tidak lagi dibungkus panel: konten duduk langsung di atas halaman. */
const SURFACE =
  "rounded-2xl border border-line bg-paper-2 p-3 sm:p-4 dark:border-line-dark dark:bg-ink-2";
/** Riwayat & Favorit tetap berupa kartu panel. */
const PANEL =
  "rounded-2xl border border-line bg-paper-2 p-3 sm:p-4 dark:border-line-dark dark:bg-ink-2";

/* ------------------------------------------------------------------ */
/* Potongan dasar                                                       */
/* ------------------------------------------------------------------ */

/** Cermin <MangaGridCard>: cover 3:4 + judul 2 baris + baris genre/waktu. */
export function GridCardSkeleton() {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper-2 dark:border-line-dark dark:bg-ink-2">
      <div className="shimmer aspect-[3/4] w-full shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col px-2.5 pb-2 pt-2.5">
        <div className="mb-2 space-y-1.5">
          <div className="shimmer h-3 w-full rounded-md" />
          <div className="shimmer h-3 w-2/3 rounded-md" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-1.5 dark:border-line-dark">
          <div className="shimmer h-2.5 w-1/3 rounded-md" />
          <div className="shimmer h-2.5 w-1/4 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Cermin <RankRow>: nomor + cover 60×80 (72×96) + judul/genre/chip chapter. */
export function RankRowSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-paper-2 p-2.5 sm:gap-3.5 sm:p-3 dark:border-line-dark dark:bg-ink-2">
      <div className="shimmer h-5 w-6 shrink-0 rounded-md sm:w-7" />
      <div className="shimmer h-[80px] w-[60px] shrink-0 rounded-lg sm:h-[96px] sm:w-[72px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="shimmer h-4 w-5/6 rounded-md" />
        <div className="shimmer h-3 w-1/2 rounded-md" />
        <div className="shimmer mt-1 h-6 w-24 rounded-md" />
      </div>
    </div>
  );
}

export function RankListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid min-w-0 gap-2.5 lg:grid-cols-2 lg:gap-3">
      {Array.from({ length: count }, (_, i) => (
        <RankRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Grid kartu seragam beranda: 2 → 3 → 4 → 6 → 8 kolom (12 kartu, 16 di xl). */
export function LatestGridSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-x-3 gap-y-5 min-[420px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 lg:gap-y-6 xl:grid-cols-8"
    >
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} className={`min-w-0 ${i >= 12 ? "hidden xl:flex" : "flex"}`}>
          <GridCardSkeleton />
        </div>
      ))}
    </div>
  );
}

/** Rail horizontal Rekomendasi. */
export function RailSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="-mx-3 -mt-2 flex gap-3 overflow-hidden px-3 pb-2 pt-2 sm:mx-0 sm:px-0"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex w-[132px] shrink-0 sm:w-[156px] lg:w-[168px]">
          <GridCardSkeleton />
        </div>
      ))}
    </div>
  );
}

/** Pil filter <Select> (h-10 di HP, h-9 di sm+). */
function FilterRowSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="filter-row">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shimmer h-10 rounded-lg sm:h-9" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per halaman                                                          */
/* ------------------------------------------------------------------ */

/** Beranda: Peringkat harian → Update terbaru → Rekomendasi. */
export function HomeSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-10 sm:gap-14 lg:gap-16" aria-busy="true">
      <section className="min-w-0">
        <div className="mb-1 flex items-end justify-between gap-3 border-b border-line pb-2 dark:border-line-dark">
          <h1 className="display-cond relative min-w-0 flex-1 truncate text-2xl text-fg sm:text-3xl lg:text-4xl dark:text-fg-dark">
            Peringkat harian
            <span aria-hidden className="bar-grow absolute -bottom-[9px] left-0 h-[3px] w-10 bg-accent" />
          </h1>
        </div>
        <div className="mt-3">
          <RankListSkeleton count={10} />
        </div>
      </section>

      <section className="min-w-0">
        <SectionHead title="Update terbaru" href="/terbaru" />
        <LatestGridSkeleton />
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
          <h2 className="display-cond text-3xl text-fg sm:text-4xl dark:text-fg-dark">Rekomendasi</h2>
          <span aria-hidden className="mt-2 block h-[3px] w-10 bg-accent" />
          <p className="mt-3 hidden text-sm leading-relaxed text-muted lg:block dark:text-muted-dark">
            Pilihan acak, berganti setiap kamu membuka beranda.
          </p>
        </div>
        <div className="min-w-0">
          <RailSkeleton />
        </div>
      </section>
    </div>
  );
}

/** /terbaru */
export function TerbaruSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4" aria-busy="true">
      <section className={`min-w-0 ${SURFACE}`}>
        <SectionHead title="Komik Terbaru" />
        <FilterRowSkeleton count={5} />
        <div className="mt-3 sm:mt-4">
          <KomikListSkeleton count={8} />
        </div>
      </section>
    </div>
  );
}

/** /populer */
export function PopulerSkeleton() {
  return (
    <section
      aria-busy="true"
      className={`flex min-w-0 flex-col gap-3 sm:gap-4 ${SURFACE}`}
    >
      <SectionHead title="Peringkat Komik" />
      <div aria-hidden="true" className="-mx-3 flex gap-1.5 overflow-hidden px-3 pb-0.5 sm:mx-0 sm:px-0">
        {["w-[72px]", "w-[88px]", "w-[78px]", "w-[104px]"].map((w, i) => (
          <div key={i} className={`shimmer h-[34px] ${w} shrink-0 rounded-lg sm:h-[30px]`} />
        ))}
      </div>
      <RankListSkeleton count={10} />
    </section>
  );
}

/** Kisi genre (dipakai /genre). */
export function GenreGridSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-w-0 grid-cols-2 gap-1.5 min-[420px]:gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
    >
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} className="shimmer h-12 rounded-xl" />
      ))}
    </div>
  );
}

/** /genre */
export function GenreListSkeleton() {
  return (
    <section aria-busy="true" className={`flex min-w-0 flex-col gap-3 sm:gap-4 ${SURFACE}`}>
      <SectionHead title="Daftar Genre" />
      <div aria-hidden="true" className="shimmer h-12 w-full rounded-lg sm:h-10 sm:max-w-xs" />
      <GenreGridSkeleton />
    </section>
  );
}

/** /genre/[slug] — `title` = nama genre yang sudah di-Title-Case. */
export function GenreDetailSkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <SectionHead title={`Genre: ${title}`} />
      <FilterRowSkeleton count={2} />
      <KomikListSkeleton count={8} />
    </div>
  );
}

/** /cari — `withResults` bila URL punya ?q= (daftar hasil akan muncul). */
export function CariSkeleton({ withResults = false }: { withResults?: boolean }) {
  return (
    <div aria-busy="true" className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <SectionHead title="Pencarian" />
      <div aria-hidden="true" className="shimmer h-12 w-full rounded-xl sm:h-14" />
      {withResults && (
        <>
          <div aria-hidden="true" className="shimmer h-5 w-48 rounded-md" />
          <KomikListSkeleton count={8} />
        </>
      )}
    </div>
  );
}

/** /favorit */
export function FavoritSkeleton({ count = 10 }: { count?: number }) {
  return (
    <section aria-busy="true" className={`flex min-w-0 flex-col gap-3 sm:gap-4 ${PANEL}`}>
      <SectionHead title="Favorit" href="/riwayat" linkLabel="Riwayat" />
      <div aria-hidden="true" className="grid-cards min-w-0">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-paper-2 dark:border-line-dark dark:bg-ink-2"
          >
            <div className="shimmer aspect-[3/4] w-full shrink-0" />
            <div className="p-2 sm:p-2.5">
              <div className="shimmer h-3.5 w-5/6 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** /riwayat */
export function RiwayatSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section aria-busy="true" className={`flex min-w-0 flex-col gap-3 sm:gap-4 ${PANEL}`}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <SectionHead title="Riwayat Baca" />
        </div>
        <div aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
          <div className="shimmer h-8 w-[84px] rounded-lg sm:h-[30px]" />
        </div>
      </div>
      <div aria-hidden="true" className="min-w-0 divide-y divide-line dark:divide-line-dark">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2.5 p-2.5 sm:gap-3 sm:p-3">
            <div className="shimmer h-20 w-14 shrink-0 rounded-lg min-[420px]:h-24 min-[420px]:w-[68px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="shimmer h-4 w-3/4 rounded-md" />
              <div className="shimmer h-3 w-1/2 rounded-md" />
              <div className="shimmer h-1 w-full max-w-40 rounded-full" />
              <div className="shimmer h-7 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** /komik/[slug] — dipindah dari page.tsx (struktur tidak diubah). */
export function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full min-w-0 flex-col gap-4 sm:gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start lg:gap-x-8 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-2 p-3 min-[420px]:p-4 sm:flex-row sm:gap-5 lg:col-start-1 lg:p-5 dark:border-line-dark dark:bg-ink-2">
        <div data-cover-slot className="shimmer mx-auto aspect-[3/4] w-32 shrink-0 rounded-xl min-[420px]:w-40 sm:mx-0 sm:w-44 sm:self-start lg:w-52" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="shimmer h-5 w-16 rounded-md" />
          <div className="shimmer h-6 w-3/4 rounded-md" />
          <div className="shimmer h-4 w-1/2 rounded-md" />
          <div className="flex flex-wrap gap-1.5">
            <div className="shimmer h-6 w-16 rounded-lg" />
            <div className="shimmer h-6 w-20 rounded-lg" />
            <div className="shimmer h-6 w-14 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
            <div className="shimmer h-4 w-2/3 rounded-md" />
            <div className="shimmer h-4 w-2/3 rounded-md" />
            <div className="shimmer h-4 w-1/2 rounded-md" />
            <div className="shimmer h-4 w-1/2 rounded-md" />
          </div>
          <div className="flex flex-col gap-2 pt-2 min-[420px]:flex-row">
            <div className="shimmer h-10 flex-1 rounded-lg min-[420px]:flex-none min-[420px]:px-5 min-[420px]:w-36" />
            <div className="shimmer h-10 flex-1 rounded-lg min-[420px]:flex-none min-[420px]:w-36" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper-2 p-3 sm:p-4 lg:col-start-1 dark:border-line-dark dark:bg-ink-2">
        <div className="shimmer mb-2 h-5 w-28 rounded-md" />
        <div className="space-y-2">
          <div className="shimmer h-3.5 w-full rounded-md" />
          <div className="shimmer h-3.5 w-full rounded-md" />
          <div className="shimmer h-3.5 w-2/3 rounded-md" />
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper-2 p-3 sm:p-4 lg:col-start-2 lg:row-start-1 lg:row-span-2 dark:border-line-dark dark:bg-ink-2">
        <div className="shimmer mb-2 h-5 w-36 rounded-md" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** /baca/[slug]/[chapter] — dipindah dari page.tsx. */
export function ReaderSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-3xl space-y-2">
      <div className="shimmer h-6 w-2/3 rounded-md" />
      {[70, 55, 80].map((h, i) => (
        <div key={i} className="shimmer w-full rounded-md" style={{ height: h * 6 }} />
      ))}
    </div>
  );
}
