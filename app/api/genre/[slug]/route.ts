import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMangaByGenre } from "@/lib/api/genre";
import { canonicalGenre } from "@/lib/api/genre-canonical";
import { guard, handle } from "../../_lib";

export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.min(50, Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1));
  // Slug persen-encode rusak (mis. /%E0%A4%A) membuat decodeURIComponent
  // melempar URIError di luar try — kembalikan 400 JSON, bukan HTML 500.
  let genre: string;
  try {
    genre = decodeURIComponent(slug);
  } catch {
    return NextResponse.json(
      { error: { message: "Parameter genre tidak valid.", source: "validation" } },
      { status: 400 },
    );
  }
  const blocked = await guard(req);
  if (blocked) return blocked;
  // Genre di respons = bentuk kanonis (nama Inggris) agar judul bagian
  // "Serupa: <genre>" sama dengan label di /genre dan halaman detail.
  const canon = canonicalGenre(genre);
  const displayGenre = canon?.name ?? genre;
  return handle(
    async () => ({
      genre: displayGenre,
      page,
      ...(await getMangaByGenre(genre, page)),
    }),
    { revalidate: 30, scope: "private" },
  );
}
