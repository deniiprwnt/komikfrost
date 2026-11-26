"use client";

import type { CSSProperties } from "react";
import type { MangaCard } from "@/lib/api/types";
import { RankRow } from "@/components/cards";

/**
 * Daftar peringkat responsif, dipakai beranda & /populer: 1 kolom di HP,
 * 2 kolom (urut ke bawah per kolom: 1-5 kiri, 6-10 kanan) mulai tablet.
 * Tata letaknya di app/refine.css (.rank-list).
 */
export function RankList({ items }: { items: MangaCard[] }) {
  const rows = Math.max(1, Math.ceil(items.length / 2));
  return (
    <div className="rank-list grid min-w-0 grid-cols-1" style={{ "--rank-rows": rows } as CSSProperties}>
      {items.map((item, i) => (
        <RankRow
          key={`${item.slug}#${item.latestChapter?.url ?? ""}`}
          item={item}
          colEnd={(i + 1) % rows === 0}
        />
      ))}
    </div>
  );
}
