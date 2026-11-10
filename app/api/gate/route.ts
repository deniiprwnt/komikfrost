import { NextResponse } from "next/server";
import { checkPassword, gateCookie, rateLimited } from "@/lib/gate";

/** Verifikasi password → set cookie sesi HttpOnly (30 hari). */
export async function POST(req: Request) {
  // Rate limit dulu — tanpa ini delay 600ms bisa diparalel attacker
  // untuk brute-force password gate tanpa batas dari satu IP.
  // Bucket sendiri + limit lebih ketat: percobaan login tidak boleh
  // menghabiskan kuota /api/* (pencarian, gambar reader) milik IP yang sama.
  if (rateLimited(req, 10, "gate")) {
    return NextResponse.json(
      { error: { message: "Terlalu banyak percobaan. Coba lagi sebentar.", source: "gate" } },
      { status: 429 },
    );
  }
  let input = "";
  try {
    const body = (await req.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      const p = (body as { password?: unknown }).password;
      if (typeof p === "string") input = p;
    }
  } catch {
    input = "";
  }
  // ENV kosong = gate nonaktif (dev lokal tetap terbuka).
  const ok = checkPassword(input);
  if (!ok) {
    // Delay kecil anti brute-force.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json(
      { error: { message: "Kata sandi salah.", source: "gate" } },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { data: { ok: true } },
    { headers: { "Set-Cookie": await gateCookie() } },
  );
}
