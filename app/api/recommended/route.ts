import type { NextRequest } from "next/server";
import { getRecommended } from "@/lib/api/manga";
import { guard, handle } from "../_lib";

export const maxDuration = 30;

/**
 * GET /api/recommended — section "Rekomendasi" beranda.
 *
 * Dipisah dari /api/home supaya tiap section beranda selesai sendiri-sendiri:
 * dulu ketiganya menunggu satu respons gabungan (≈7 dtk saat dingin), jadi
 * peringkat di atas layar ikut kosong menunggu rekomendasi.
 */
export async function GET(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  return handle(async () => ({ items: await getRecommended() }), {
    revalidate: 60,
    scope: "private",
  });
}
