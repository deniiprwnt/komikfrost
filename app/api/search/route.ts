import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { searchManga } from "@/lib/api/search";
import { guard, handle } from "../_lib";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  // Tolak query kosong sebelum scrape upstream — query kosong tidak punya
  // arti pencarian dan hanya membakar request ke sumber data.
  if (!q) {
    return NextResponse.json(
      { error: { message: "Kata kunci pencarian kosong.", source: "validation" } },
      { status: 400 },
    );
  }
  const page = Math.min(50, Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1));
  // Bucket khusus: pencarian memicu 2-3 scrape + enrich, jadi lebih
  // ketat dari bucket API umum (60/menit).
  const blocked = await guard(req, { limit: 20, bucket: "search" });
  if (blocked) return blocked;
  return handle(
    async () => ({ keyword: q, page, ...(await searchManga(q, page)) }),
    {
      revalidate: 300,
      scope: "private",
    },
  );
}
