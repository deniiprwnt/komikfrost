import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { COOKIE, isAuthed } from "@/lib/gate";

/**
 * Gerbang akses + keamanan dasar:
 * 1. Password gate — semua rute (halaman + /api/*) butuh cookie sesi,
 *    kecuali /masuk, file statis, dan _next internal.
 * 2. Header anti-index global (backup dari metadata robots).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Aset statis / internal Next — tanpa baca env/cookie sama sekali,
  // agar failure konfigurasi tidak meruntuhkan file publik.
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    // Berkas PWA wajib bisa diambil browser TANPA sesi: service worker
    // mendaftar sebelum login, dan manifest dibaca saat instalasi.
    // Dicek EKSPLISIT (bukan via regex ekstensi) supaya file publik
    // ber-ekstensi .html/.webmanifest lain tidak ikut lolos gerbang.
    // /sw.js sudah tercakup regex .js di bawah.
    pathname === "/manifest.webmanifest" ||
    pathname === "/offline.html" ||
    // Aset statis publik. Rute /api/* DIKECUALIKAN dari aturan ekstensi:
    // tanpa ini path API berakhiran .js/.css/.png akan lolos gerbang
    // password (tidak ada hari ini, tapi jangan bergantung pada itu).
    (!pathname.startsWith("/api/") &&
      /\.(png|jpg|jpeg|webp|gif|svg|ico|css|js|woff2?)$/.test(pathname))
  ) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return res;
  }

  // Guard: ENV hilang/rusak tidak boleh meledakkan middleware menjadi 500.
  // Tanpa SITE_PASSWORD → situs terbuka (sama seperti perilaku dev lokal),
  // supaya kesalahan konfigurasi tidak meruntuhkan production.
  let authed = false;
  try {
    authed = await isAuthed(req);
  } catch {
    authed = process.env.SITE_PASSWORD ? false : true;
  }

  const res = NextResponse.next();
  // Anti-index lapis transport — berlaku walau crawler mengabaikan robots.txt.
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");

  // Halaman login + API login selalu lolos (kalau sudah login → lempar ke beranda).
  // PENTING: /api/gate harus dikecualikan — kalau tidak, user yang belum
  // login tidak akan pernah bisa login karena request login-nya ikut diblokir.
  if (pathname === "/masuk" || pathname === "/api/gate" || pathname === "/api/health") {
    if (pathname === "/masuk" && authed) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return res;
  }

  if (!authed) {
    // API → 401 JSON (bukan redirect HTML agar client fetch tetap waras).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { message: "Akses terkunci.", source: "gate" } },
        { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } },
      );
    }
    // Halaman → alihkan ke /masuk dengan kembali ke tujuan semula.
    const url = req.nextUrl.clone();
    url.pathname = "/masuk";
    // Sertakan query string (filter & pagination) agar tidak hilang
    // setelah login.
    url.searchParams.set("next", pathname + req.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    redirect.cookies.delete(COOKIE);
    return redirect;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
