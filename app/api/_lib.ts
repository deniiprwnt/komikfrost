import { NextRequest, NextResponse } from "next/server";
import { KomikuError } from "@/lib/api/komiku";
import { KomikcastError } from "@/lib/api/komikcast";
import { isAuthed, rateLimited } from "@/lib/gate";

/**
 * Bungkus handler agar KomikuError menjadi JSON error yang konsisten.
 * Proteksi lapis API (selain middleware gate):
 * - Rate limit 60 req/menit/IP — cegah 1 orang menyedot API.
 * - Origin/Referer check — tolak embed lintas-situs (header mudah
 *   dipalsukan, jadi ini pertahanan kedua; gate password yang utama).
 */
export async function guard(
  req: NextRequest,
  rate?: { limit: number; bucket: string },
): Promise<NextResponse | null> {
  if (rateLimited(req, rate?.limit, rate?.bucket)) {
    return NextResponse.json(
      { error: { message: "Terlalu banyak permintaan. Tunggu sebentar.", source: "rate-limit" } },
      { status: 429 },
    );
  }
  if (!(await isAuthed(req))) {
    return NextResponse.json(
      { error: { message: "Akses terkunci.", source: "gate" } },
      { status: 401 },
    );
  }
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const sameSite = (u: string | null) => {
    if (!u) return false;
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  };
  // Tolak embed lintas situs walau Origin/Referer sama-sama kosong: fetch
  // lintas origin dari browser mengirim `Sec-Fetch-Site: cross-site`.
  // (Klien non-browser tetap lolos di sini — gate password yang utama.)
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { error: { message: "Akses ditolak.", source: "gate" } },
      { status: 403 },
    );
  }
  if ((origin || referer) && !sameSite(origin) && !sameSite(referer)) {
    return NextResponse.json(
      { error: { message: "Akses ditolak.", source: "gate" } },
      { status: 403 },
    );
  }
  return null;
}

export async function handle<T>(
  fn: () => Promise<T>,
  opts?: { revalidate?: number; scope?: "public" | "private" },
) {
  try {
    const data = await fn();
    return NextResponse.json(
      { data },
      opts?.revalidate
        ? {
            headers: {
              // Route ber-gate (mis. /api/home) wajib scope "private" agar
              // CDN tidak menyajikan konten ke request yang belum autentik.
              // Sertakan max-age DAN s-maxage: sebelumnya scope public hanya
              // mengirim s-maxage (browser tidak meng-cache), scope private
              // hanya max-age (CDN/edge tidak meng-cache). Keduanya + Vary:
              // Cookie membuat browser & edge memakai SWR, bukan re-scrape.
              // stale-if-error: upstream sesaat gagal tidak memicu retry
              // berantai dari klien yang semuanya menembak scrape lagi.
              "Cache-Control": `${opts.scope ?? "public"}, max-age=${opts.revalidate}, s-maxage=${opts.scope === "private" ? 0 : opts.revalidate}, stale-while-revalidate=${opts.revalidate * 2}, stale-if-error=${opts.revalidate * 4}`,
              ...(opts.scope === "private" ? { Vary: "Cookie" } : {}),
            },
          }
        : undefined,
    );
  } catch (e) {
    if (e instanceof KomikuError || e instanceof KomikcastError) {
      // URL sumber lengkap hanya masuk log server — ke browser kirim
      // message saja agar domain asal tidak bocor via DevTools.
      console.error(`[api-error] ${e.source}: ${e.message}`);
      return NextResponse.json(
        { error: { message: e.message, source: "upstream" } },
        { status: e.status ?? 502 },
      );
    }
    return NextResponse.json(
      { error: { message: "Terjadi kesalahan tak terduga.", source: "internal" } },
      { status: 500 },
    );
  }
}
