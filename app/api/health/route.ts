import { NextResponse } from "next/server";

/**
 * Liveness endpoint â€” dipakai uptime monitor (tanpa gate). Hanya
 * mengembalikan status hidup; tidak menyentuh upstream apa pun.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
