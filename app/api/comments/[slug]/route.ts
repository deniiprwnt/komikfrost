import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getComments } from "@/lib/api/comments";
import { guard, handle } from "../../_lib";

export const maxDuration = 30;

/**
 * GET /api/comments/<slug>              → komentar halaman detail komik
 * GET /api/comments/<slug>?chapter=<n>  → komentar satu chapter
 * Tiap sumber (Shinigami / Komiku / Komikcast) dikembalikan terpisah,
 * jadi satu sumber gagal tidak menghilangkan komentar sumber lain.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let decoded: string;
  let chapter: string | undefined;
  let debug = false;
  try {
    decoded = decodeURIComponent(slug);
    const raw = new URL(req.url).searchParams.get("chapter");
    chapter = raw ? raw.slice(0, 120) : undefined;
    debug = new URL(req.url).searchParams.get("debug") === "1";
  } catch {
    return NextResponse.json(
      { error: { message: "Parameter tidak valid.", source: "validation" } },
      { status: 400 },
    );
  }
  // Bucket sendiri: komentar memicu hingga 3 request upstream per panggilan.
  const blocked = await guard(req, { limit: 30, bucket: "comments" });
  if (blocked) return blocked;
  // ?debug=1 → jejak percobaan tiap sumber (tanpa cache) untuk diagnosis.
  if (debug) return handle(() => getComments(decoded, chapter, true));
  return handle(() => getComments(decoded, chapter), { revalidate: 120, scope: "private" });
}
