import Link from "next/link";
import type { MangaCard } from "@/lib/api/types";
import { CoverImage } from "@/components/cover-image";
import { formatViews } from "@/lib/format-views";
import { TypeBadge, chapterPathToRoute } from "@/components/cards";

/**
 * Sorotan beranda: judul peringkat #1 dari data peringkat harian yang sama
 * (tanpa data tambahan). Latar = cover yang diburamkan, cover tegak di kanan.
 */
export function HomeHero({ item }: { item: MangaCard }) {
  const rank = typeof item.rank === "number" ? item.rank : 1;
  return (
    <section aria-label="Sorotan hari ini" className="hero">
      <div className="hero__inner">
        <div className="min-w-0">
          <p className="hero__eyebrow">
            <b>#{rank}</b>
            Sorotan hari ini
          </p>
          <h2 className="hero__title">{item.title}</h2>
          <div className="hero__meta">
            {item.type && <TypeBadge type={item.type} />}
            {item.genre && <span>{item.genre}</span>}
            {item.genre && item.views && <i aria-hidden="true" />}
            {item.views && <span className="tabular-nums">{formatViews(item.views)} dibaca</span>}
          </div>
          {item.synopsis && <p className="hero__syn">{item.synopsis}</p>}
          <div className="hero__cta">
            <Link href={`/komik/${item.slug}`} className="hero__btn hero__btn--primary">
              Buka komik
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14m0 0-6-6m6 6-6 6" />
              </svg>
            </Link>
            {item.latestChapter && (
              <Link href={chapterPathToRoute(item.latestChapter.url)} className="hero__btn">
                {item.latestChapter.label}
              </Link>
            )}
          </div>
        </div>
        <Link href={`/komik/${item.slug}`} aria-label={item.title} className="hero__cover">
          <CoverImage src={item.thumbnail} fallbackSrcs={item.thumbnailCandidates} alt={item.title} className="h-full w-full object-cover" />
        </Link>
      </div>
    </section>
  );
}
