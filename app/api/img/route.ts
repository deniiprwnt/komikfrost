import type { NextRequest } from "next/server";
import { isAllowedImageHost } from "@/lib/api/img-proxy";
import { guard } from "../_lib";

/**
 * GET /api/img?u=<url-gambar-upstream-encode>
 * Proxy gambar upstream (cover + reader) lewat origin sendiri.
 *
 * Latar: host gambar Shinigami (assets.shngm.id) me-reset koneksi TLS
 * dari jaringan Indonesia (ECONNRESET/000) â€” browser me-render slot
 * abu-abu kosong walau URL cover dari API valid. Lewat proxy ini,
 * browser memuat dari origin KomikFrost (relatif, tanpa CORS/hotlink),
 * dan fetch server-side (Vercel, jaringan luar) mencapai host-nya.
 *
 * Keamanan: hanya host upstream yang dikenal (termasuk subdomainnya);
 * path dibatasi ke gambar; tanpa cookie/auth ke upstream; timeout 15 dtk;
 * Content-Type dari respons upstream yang tervalidasi; Cache-Control
 * private 7 hari.
 */
// Route ini tetap dinamis (membaca `req.nextUrl.searchParams`), tapi JANGAN
// dipaksa `force-dynamic`: opsi itu setara `fetchCache = "force-no-store"` dan
// mematikan `next.revalidate` di bawah, sehingga cache server 7 hari tidak
// pernah terpakai.
// Upstream gambar bisa lambat (abort 15 dtk di bawah) â€” jangan biarkan batas
// fungsi default memutus stream sebelum itu.
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Allowlist fetch upstream = daftar host/sufiks domain di img-proxy
// (satu sumber, ikut mencakup subdomain seperti cdn.shngm.io).

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

const IMG_CACHE_SECONDS = 604800;

/**
 * In-flight dedupe per URL upstream: satu grid berisi puluhan cover baru bisa
 * meminta URL yang SAMA berkali-kali dalam satu batch render (kartu utama +
 * daftar serupa + prefetch). Tanpa ini kunjungan pertama menembak upstream
 * berulang untuk gambar yang sama dan memperlambat sampul above-the-fold.
 * Hasil sukses tetap disimpan cache HTTP Next (`next.revalidate` di bawah).
 */
const imgInflight = new Map<string, Promise<{ body: Buffer; contentType: string }>>();

/** Respons gambar dengan header cache yang sudah benar. */
function imageResponse(body: Buffer, ct: string): Response {
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": ct,
      // Route ini di belakang gate â†’ cache browser saja (private), jangan
      // biarkan CDN menyajikan gambar kepada request tanpa sesi.
      // `immutable`: URL gambar berisi nama file unik dan tidak berubah,
      // jadi browser tidak perlu memvalidasi ulang tiap kunjungan.
      "Cache-Control": `private, max-age=${IMG_CACHE_SECONDS}, immutable, stale-while-revalidate=${IMG_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
      // Konten sudah final â†’ izinkan browser menyimpan salinan decode agar
      // paint berikutnya instan.
      "Content-Length": String(body.byteLength),
    },
  });
}

export async function GET(req: NextRequest) {
  // Bucket gambar terpisah dengan batas tinggi: satu chapter berisi puluhan
  // gambar, jadi memakai batas API (60/menit) membuat gambar ke-61 dst
  // dijawab 429 â€” penyebab utama halaman chapter tampil kosong.
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
  if (url.protocol !== "https:" || !isAllowedImageHost(url.hostname)) {
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

  const key = url.toString();

  // Dedupe in-flight: request untuk URL yang sama saat fetch pertama belum
  // selesai berbagi satu promise (bukan satu fetch per kartu).
  const existing = imgInflight.get(key);
  if (existing) {
    try {
      const { body, contentType } = await existing;
      return imageResponse(body, contentType);
    } catch {
      return Response.json(
        { error: { message: "Gambar upstream tidak tersedia.", source: "upstream" } },
        { status: 502 },
      );
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });

  const job = (async (): Promise<{ body: Buffer; contentType: string }> => {
    // Gambar chapter bersifat abadi (URL berisi nama file unik). Gunakan
    // cache HTTP Next/Data Cache 7 hari agar proxy bisa menyajikan dari
    // cache server tanpa menyentuh upstream berulang kali - jauh lebih cepat
    // dan menghemat bandwidth. `IMG_CACHE_SECONDS` = 7 hari.
    const upstream = await fetch(key, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", Referer: `${url.protocol}//${url.host}/` },
      signal: ctrl.signal,
      next: { revalidate: IMG_CACHE_SECONDS },
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error("upstream-unavailable");
    }
    const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      throw new Error("upstream-not-image");
    }
    // Baca PENUH ke buffer: respons upstream berupa stream sekali-pakai;
    // buffer bisa dipakai bersama request yang menunggu di dedupe di atas.
    const body = Buffer.from(await upstream.arrayBuffer());
    return { body, contentType: ct };
  })();

  imgInflight.set(key, job);
  try {
    const { body, contentType } = await job;
    return imageResponse(body, contentType);
  } catch {
    return Response.json(
      { error: { message: "Gagal mengambil gambar.", source: "upstream" } },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
    // Lepas hanya bila entri masih milik job ini (hindari menghapus job baru
    // dengan URL sama yang dimulai tepat setelah yang lama selesai).
    if (imgInflight.get(key) === job) imgInflight.delete(key);
  }
}
