"use client";

import { chapterDateLabel } from "@/lib/chapter-date";
import { useNowTick } from "@/lib/relative-time";

/**
 * Tanggal rilis satu chapter: "Hari ini" / "Kemarin" / "24/11/2026".
 * Render pertama (sebelum hidrasi) memakai teks tanggal dari server agar
 * tidak ada mismatch; setelah tick pertama label relatif yang dipakai.
 */
export function ChapterDate({
  date,
  dateTs,
  className,
}: {
  date?: string;
  dateTs?: number;
  className?: string;
}) {
  const now = useNowTick();
  const label = now === null ? date : chapterDateLabel(dateTs, date, now);
  if (!label) return null;
  return <span className={className}>{label}</span>;
}
