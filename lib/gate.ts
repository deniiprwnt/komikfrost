import type { NextRequest } from "next/server";

export const COOKIE = "bk-gate";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 hari

function getPassword(): string {
  return process.env.SITE_PASSWORD || "";
}

/** constant-time compare sederhana agar tidak bocor via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token sesi stateless: HMAC-SHA256 password via Web Crypto (edge-safe).
 *  Cookie tidak pernah berisi password mentah. */
async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionToken(): Promise<string> {
  return hmacHex(getPassword(), "komikfrost-gate-v1");
}

export async function isAuthed(req: NextRequest): Promise<boolean> {
  const pw = getPassword();
  if (!pw) return true; // ENV belum dipasang (dev lokal) → terbuka.
  const raw = req.cookies.get(COOKIE)?.value ?? "";
  const expected = await sessionToken();
  try {
    const v = decodeURIComponent(raw);
    return v.length === expected.length && safeEqual(v, expected);
  } catch {
    return false;
  }
}

/** Rate limit memori per-IP (cukup untuk hobby deploy 1 instance). */
const hits = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 60; // 60 req/menit/IP untuk /api/*

/**
 * @param limit  batas per menit untuk bucket ini
 * @param bucket nama bucket — tiap bucket punya hitungan sendiri.
 *   Gambar reader WAJIB punya bucket terpisah: satu chapter bisa 20-100
 *   gambar, jadi ikut menghitung di bucket API (60/menit) membuat gambar
 *   berikutnya dijawab 429 dan halaman tampil kosong.
 */
export function rateLimited(req: Request, limit = LIMIT, bucket = "api"): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  // Sapu entri kedaluwarsa: Map ini dulu hanya di-reset saat IP yang SAMA
  // datang lagi, sehingga entri IP sekali-pakai menumpuk selamanya
  // (kebocoran memori di proses yang hidup lama).
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  }
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  rec.n += 1;
  return rec.n > limit;
}

/** Cek password untuk dipakai route /api/gate (dibutuhkan di sana). */
export function checkPassword(input: string): boolean {
  const pw = getPassword();
  if (!pw) return true;
  return input.length === pw.length && safeEqual(input, pw);
}

export async function gateCookie(): Promise<string> {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${await sessionToken()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearGateCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
