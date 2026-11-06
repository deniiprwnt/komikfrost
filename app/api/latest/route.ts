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
  // Jumlah kartu per respons. Default 15 (/terbaru); beranda minta 16 agar
  // grid 8-kolom terisi penuh (8+7 bukan 8+8 = slot kosong).
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "15", 10) || 15));
  // live=1 → probe auto-refresh: bypass cache memori + cache HTTP upstream,
  // dan jangan biarkan respons ini di-cache browser/CDN.
  const live = searchParams.get("live") === "1";
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
  // Probe live (auto-refresh) punya bucket sendiri dengan batas lebih longgar:
  // polling berkala tidak boleh menghabiskan jatah 60/menit bersama prefetch
  // dan navigasi — kalau kena 429, klien mengabaikannya dan daftar tidak update.
  const blocked = await guard(req, live ? { limit: 240, bucket: "latest-live" } : undefined);
  if (blocked) return blocked;
  return handle(
    () =>
      getLatestPaged(page, {
        ...(orderby ? { orderby } : {}),
        ...(tipe ? { tipe } : {}),
        ...(genre ? { genre } : {}),
        ...(genre2 ? { genre2 } : {}),
        ...(status ? { status } : {}),
        ...(limit !== 15 ? { limit } : {}),
        ...(live ? { live: true } : {}),
      }),
    // Cache browser 10 dtk (private, bukan CDN) — klik pagination
    // bolak-balik tidak bakar scrape 3 source berulang, tapi daftar
    // terbaru tetap segar. Probe live TIDAK diberi Cache-Control sama
    // sekali agar respons selalu baru.
    live ? undefined : { revalidate: 10, scope: "private" },
  );
}
