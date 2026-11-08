import type { NextRequest } from "next/server";
import { getPopular } from "@/lib/api/manga";
import type { RankPeriod } from "@/lib/api/komiku";
import { guard, handle } from "../_lib";

export const maxDuration = 30;

const PERIODS: RankPeriod[] = ["harian", "mingguan", "bulanan", "total"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("period") || "harian").toLowerCase();
  const period: RankPeriod = PERIODS.includes(raw as RankPeriod)
    ? (raw as RankPeriod)
    : "harian";
  const blocked = await guard(req);
  if (blocked) return blocked;
  // Revalidate 30 -> 120 dtk: peringkat jarang berubah (upstream update
  // harian). Cache browser lebih lama = navigasi bolak-balik instan,
  // tanpa mengorbankan kebenaran data â€” auto-refresh halaman populer di
  // klien tetap 60 dtk (silentCheck membandingkan isi 3 teratas).
  return handle(async () => ({ period, items: await getPopular(period) }), {
    revalidate: 120,
    scope: "private",
  });
}
