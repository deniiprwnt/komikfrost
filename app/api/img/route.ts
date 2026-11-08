import type { NextRequest } from "next/server";
import { IMG_HOSTS } from "@/lib/api/img-proxy";
import { guard } from "../_lib";

/**
 * GET /api/img?u=<url-gambar-upstream-encode>
 * Proxy gambar upstream (cover + reader) lewat origin sendiri.
 *
 * Latar: host gambar Shinigami (assets.shngm.id) me-reset koneksi TLS
 * dari jaringan Indonesia (ECONNRESET/000) — browser me-render slot
 * abu-abu kosong walau URL cover dari API valid. Lewat proxy ini,
 * browser memuat dari origin KomikFrost (relatif, tanpa CORS/hotlink),
 * dan fetch server-side (Vercel, jaringan luar) mencapai host-nya.
 *
 * Keamanan: hanya host upstream yang dikenal; path dibatasi ke gambar;
 * tanpa cookie/auth ke upstream; timeout 15 dtk; Content-Type dari
 * respons upstream yang tervalidasi; Cache-Control private 7 hari.
 */
export const dynamic = "force-dynamic";
// Upstream gambar bisa lambat (abort 15 dtk di bawah) — jangan biarkan
// batas fungsi default memutus stream sebelum itu.
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Allowlist fetch upstream = daftar host di img-proxy (satu sumber).
const ALLOWED_HOSTS = IMG_HOSTS;

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

const IMG_CACHE_SECONDS = 604800;

export async function GET(req: NextRequest) {
  // Bucket gambar terpisah dengan batas tinggi: satu chapter berisi puluhan
  // gambar, jadi memakai batas API (60/menit) membuat gambar ke-61 dst
  // dijawab 429 — penyebab utama halaman chapter tampil kosong.
  const blocked = await guard(req, { limit: 600, bucket: "img" });
  if (blocked) return blocked;

  const raw = (req.nextUrl.searchParams.get("u") || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Response.json(
      { error: { message: "Parameter gambar tidak valid.", source: "validation" } },
      { status: 400 },
    );
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return Response.json(
      { error: { message: "Host gambar tidak diizinkan.", source: "validation" } },
      { status: 400 },
    );
  }
  if (!IMG_EXT.test(url.pathname)) {
    return Response.json(
      { error: { message: "Bukan URL gambar.", source: "validation" } },
      { status: 400 },
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    // Gambar chapter bersifat abadi (URL berisi nama file unik). Gunakan
    // cache HTTP Next/Data Cache 7 hari agar proxy bisa menyajikan dari
    // cache server tanpa menyentuh upstream berulang kali - jauh lebih cepat
    // dan menghemat bandwidth. `IMG_CACHE_SECONDS` = 7 hari.
    const upstream = await fetch(url.toString(), {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", Referer: `${url.protocol}//${url.host}/` },
      signal: ctrl.signal,
      next: { revalidate: IMG_CACHE_SECONDS },
    });
    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: { message: "Gambar upstream tidak tersedia.", source: "upstream" } },
        { status: 502 },
      );
    }
    const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      return Response.json(
        { error: { message: "Respons bukan gambar.", source: "upstream" } },
        { status: 502 },
      );
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": ct,
        // Route ini di belakang gate → cache browser saja (private), jangan
        // biarkan CDN menyajikan gambar kepada request tanpa sesi.
        "Cache-Control": `private, max-age=${IMG_CACHE_SECONDS}, stale-while-revalidate=${IMG_CACHE_SECONDS}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: { message: "Gagal mengambil gambar.", source: "upstream" } },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
