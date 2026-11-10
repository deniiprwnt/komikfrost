import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMangaSummary } from "@/lib/api/manga";
import { getComic } from "@/lib/api/comic";
import { guard, handle } from "../../_lib";

export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  // Slug persen-encode rusak membuat decodeURIComponent melempar URIError
  // di luar try — kembalikan 400 JSON, bukan HTML 500.
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return NextResponse.json(
      { error: { message: "Parameter slug tidak valid.", source: "validation" } },
      { status: 400 },
    );
  }
  const blocked = await guard(req);
  if (blocked) return blocked;
  // ringkas=1 → ringkasan ringan dengan aturan prioritas yang SAMA dengan detail
  // (Shinigami → Komiku → Komikcast) untuk badge tipe/genre/chapter terbaru.
  // Dipakai daftar peringkat & halaman favorit yang memanggil banyak judul.
  if (new URL(req.url).searchParams.get("ringkas") === "1") {
    return handle(() => getMangaSummary(decoded), { revalidate: 300, scope: "private" });
  }
  // Revalidate 30 -> 60 dtk: detail komik jarang berubah, sedangkan 30 dtk
  // terlalu agresif untuk back-navigation cepat dari reader. Server-side
  // cache detail (60 dtk di detailCache) tetap jadi lapis utama.
  return handle(() => getComic(decoded), { revalidate: 60, scope: "private" });
}
