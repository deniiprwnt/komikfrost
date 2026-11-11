import Link from "next/link";
import type { MangaCard } from "@/lib/api/types";
import { MangaGridCard } from "./cards";
import { PromoYukiHead } from "./promo-yuki";

/** Skeleton loading untuk grid kartu. */
export function GridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-paper-2 dark:bg-ink-2">
          <div className="shimmer aspect-[3/4]" />
          <div className="space-y-1.5 p-2 sm:p-2.5">
            <div className="shimmer h-3 w-11/12 rounded-md" />
            <div className="shimmer h-2.5 w-2/3 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton loading untuk daftar baris. */
export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-line dark:divide-line-dark">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2.5 py-3 sm:gap-3">
          <div className="shimmer h-[60px] w-[92px] shrink-0 rounded-lg sm:h-[68px] sm:w-[110px]" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="shimmer h-3.5 w-3/4 rounded-md" />
            <div className="shimmer h-3 w-1/2 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** State error: tampilkan pesan jelas, tanpa data pengganti. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-md border border-danger/25 bg-danger/5 px-4 py-10 text-center dark:border-danger-dark/30 dark:bg-danger-dark/10">
      <p className="text-sm font-semibold text-danger dark:text-danger-dark">Gagal memuat data</p>
      <p className="max-w-md text-sm text-danger/90 dark:text-danger-dark/90">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-danger/40 px-4 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white active:scale-[0.97] dark:border-danger-dark/40 dark:text-danger-dark dark:hover:bg-danger-dark dark:hover:text-ink"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}

/** State kosong: API berhasil tapi tidak ada hasil. Tanpa kotak putus-putus; ikon + teks di tengah. */
export function EmptyState({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:py-16 ${className}`}
    >
      <PromoYukiHead mood="sad" className="h-16 w-auto sm:h-[4.5rem]" />
      <p className="max-w-sm text-balance text-sm leading-relaxed text-muted dark:text-muted-dark">{message}</p>
    </div>
  );
}

/** Judul section + link "Lihat semua". Judul condensed, garis tebal pendek di bawahnya. */
export function SectionHead({
  title,
  href,
  linkLabel = "Lihat semua",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex min-w-0 items-end justify-between gap-3 border-b border-line pb-2 dark:border-line-dark">
      <h2 className="display-cond relative min-w-0 flex-1 truncate text-2xl text-fg sm:text-3xl lg:text-4xl dark:text-fg-dark">
        {title}
        <span aria-hidden className="bar-grow absolute -bottom-[9px] left-0 h-[3px] w-10 bg-accent" />
      </h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-accent hover:border-accent sm:py-1.5 dark:border-line-dark"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

/** Grid kartu fluid: kolom otomatis menyesuaikan lebar (2 di HP kecil → 8+ di monitor lebar). */
export function MangaGrid({ items }: { items: MangaCard[] }) {
  return (
    <div className="grid-cards">
      {items.map((item, i) => (
        <MangaGridCard
          key={`${item.slug}#${item.latestChapter?.url ?? item.firstChapter?.url ?? i}`}
          item={item}
        />
      ))}
    </div>
  );
}
