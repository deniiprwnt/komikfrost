import type { NextRequest } from "next/server";
import { getLatestPaged } from "@/lib/api/manga";
import { guard, handle } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ORDERBYS = ["modified", "date", "popular", "rand"] as const;
type Orderby = (typeof ORDERBYS)[number];
const TIPES = ["manga", "manhwa", "manhua"] as const;
type Tipe = (typeof TIPES)[number];
const STATUSES = ["ongoing", "end"] as const;
type Status = (typeof STATUSES)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.min(50, Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1));
  // Allowlist nilai enum — string arbitrer tidak diteruskan ke upstream.
  // Nilai tak dikenal diabaikan (fallback default), seperti /api/popular.
  const rawOrderby = searchParams.get("orderby");
  const orderby: Orderby | null = ORDERBYS.includes(rawOrderby as Orderby)
    ? (rawOrderby as Orderby)
    : null;
  const rawTipe = searchParams.get("tipe");
  const tipe: Tipe | null = TIPES.includes(rawTipe as Tipe) ? (rawTipe as Tipe) : null;
  const genre = searchParams.get("genre");
  const genre2 = searchParams.get("genre2");
  const rawStatus = searchParams.get("status");
  const status: Status | null = STATUSES.includes(rawStatus as Status)
    ? (rawStatus as Status)
    : null;
  const blocked = await guard(req);
  if (blocked) return blocked;
  return handle(
    () =>
      getLatestPaged(page, {
        ...(orderby ? { orderby } : {}),
        ...(tipe ? { tipe } : {}),
        ...(genre ? { genre } : {}),
        ...(genre2 ? { genre2 } : {}),
        ...(status ? { status } : {}),
      }),
    // Cache browser 10 dtk (private, bukan CDN) — klik pagination
    // bolak-balik tidak bakar scrape 3 source berulang, tapi daftar
    // terbaru tetap segar.
    { revalidate: 10, scope: "private" },
  );
}
