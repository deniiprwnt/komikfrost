import type { NextRequest } from "next/server";
import { alternateImageUrls, isAllowedImageHost } from "@/lib/api/img-proxy";
import { etagMatches, weakEtag } from "@/lib/api/http-cache";
import { guard } from "../_lib";

/**
 * GET /api/img?u=<url-gambar-upstream-encode>
 * Proxy gambar upstream (cover + reader) lewat origin sendiri.
 *
 * Latar: host gambar sumber (assets.shngm.id, imageN.komiku.to,
 * komikcast.top) sering diblokir/reset dari jaringan Indonesia â€” browser
 * me-render slot abu-abu kosong walau URL dari API valid. Lewat proxy ini,
 * browser memuat dari origin KomikFrost (relatif, tanpa CORS/hotlink), dan
 * fetch server-side mencapai host-nya.
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
//
// AUTENTIKASI: middleware mengecualikan /api/img (agar tidak membayar HMAC
// sesi untuk tiap gambar), jadi gerbang password route ini SEPENUHNYA
// bergantung pada guard() di bawah â€” guard() memanggil isAuthed() dan
// mengembalikan 401 sebelum satu byte pun diambil dari upstream. Jangan
// pernah menghapus/melonggarkan panggilan itu.
// Upstream gambar bisa lambat (abort 15 dtk di bawah) â€” jangan biarkan batas
// fungsi default memutus stream sebelum itu.
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

const IMG_CACHE_SECONDS = 604800;

// TIDAK ada dedupe buffer lagi: sebelumnya tiap gambar dibaca PENUH ke
// Buffer (arrayBuffer) sebelum 1 byte pun dikirim â€” memori + CPU + durasi
// fungsi membengkak per gambar reader (20-100 gambar/chapter). Sekarang
// body upstream di-stream langsung ke browser; Next Data Cache
// (next.revalidate di fetchImage) tetap meng-cache di server.

/**
 * Header cache gambar. SENGAJA `private` + `max-age` (bukan `public`):
 * route ini di belakang gerbang password, jadi cache gambar TIDAK BOLEH
 * disajikan CDN/edge kepada request tanpa sesi. Penghematan bandwidth
 * dilakukan lewat ETag (304 tanpa body), BUKAN dengan membuka cache ke
 * publik.
 */
function imageCacheControl(): string {
  return `private, max-age=${IMG_CACHE_SECONDS}, immutable, stale-while-revalidate=${IMG_CACHE_SECONDS}`;
}

/** ETag isi gambar = identitas file upstream (stabil, tanpa baca body). */
function imageEtag(key: string): string {
  return weakEtag("img-v1", key);
}

/** Respons gambar dengan header cache yang sudah benar. */
function imageResponse(body: BodyInit, ct: string, etag: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": imageCacheControl(),
      // `immutable`: URL gambar berisi nama file unik dan tidak berubah,
      // jadi browser tidak perlu memvalidasi ulang tiap kunjungan.
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * 304 Not Modified â€” HANYA menghemat bandwidth. Pemanggilan fungsi tetap
 * terjadi (route tetap dieksekusi, guard tetap dijalankan) dan tidak ada
 * data komik yang di-cache lebih lama karenanya.
 *
 * Header cache WAJIB diulang di 304: browser memakai header dari respons
 * 304 untuk memperbarui masa berlaku entri yang sudah dimilikinya.
 */
function notModified(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: {
      "Cache-Control": imageCacheControl(),
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Ambil satu URL gambar upstream dan validasi hasilnya benar-benar gambar.
 * Gambar chapter bersifat abadi (URL berisi nama file unik) â†’ cache HTTP
 * Next/Data Cache 7 hari agar proxy menyajikan dari cache server tanpa
 * menyentuh upstream berulang kali.
 */
async function fetchImage(
  target: string,
  signal: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array> | null; contentType: string }> {
  const parsed = new URL(target);
  const upstream = await fetch(target, {
    headers: {
      "User-Agent": UA,
      Accept: "image/*,*/*;q=0.8",
      Referer: `${parsed.protocol}//${parsed.host}/`,
    },
    signal,
    next: { revalidate: IMG_CACHE_SECONDS },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error("upstream-unavailable");
  }
  const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/")) {
    throw new Error("upstream-not-image");
  }
  // Stream langsung, tanpa Buffer.from(arrayBuffer): pemanggil meneruskan
  // upstream.body ke Response sehingga byte pertama mengalir tanpa menunggu
  // seluruh file terunduh di memori fungsi.
  return { body: upstream.body, contentType: ct };
}

/**
 * Daftar URL yang akan dicoba, berurutan: URL yang diminta, lalu host
 * alternatif yang menyajikan file yang sama (imageN.komiku.to â‡„
 * img.komiku.org, thumbnail.to â‡„ thumbnail.org, assets â‡„ cdn Shinigami).
 *
 * Tanpa rantai ini, satu host yang mati membuat sampul berakhir placeholder
 * PERMANEN (kegagalan di-cache 7 hari) walau host lain masih hidup â€” inilah
 * sebab sampul seperti Limit Breaker hilang di Lanjut Membaca & Riwayat.
 */
function candidateUrls(key: string): string[] {
  const out: string[] = [key];
  const push = (u: string) => {
    if (!out.includes(u)) out.push(u);
  };
  for (const alt of alternateImageUrls(key)) {
    try {
      const p = new URL(alt);
      if (p.protocol !== "https:" || !isAllowedImageHost(p.hostname)) continue;
      const inner = p.searchParams.get("u");
      if (inner) {
        const t = new URL(inner);
        if (t.protocol === "https:" && isAllowedImageHost(t.hostname) && IMG_EXT.test(t.pathname)) {
          push(t.toString());
        }
      } else if (IMG_EXT.test(p.pathname)) {
        push(p.toString());
      }
    } catch {
      // alternatif tidak valid â€” lewati
    }
  }
  return out;
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
  const etag = imageEtag(key);
  // Validasi ulang dari browser: isi untuk URL gambar ini tidak pernah
  // berubah, jadi 304 sudah benar tanpa menyentuh upstream (hemat
  // bandwidth + satu fetch upstream). Ini BUKAN cache data komik.
  if (etagMatches(req.headers.get("if-none-match"), etag)) {
    return notModified(etag);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    let lastErr: unknown = null;
    for (const target of candidateUrls(key)) {
      try {
        const { body, contentType } = await fetchImage(target, ctrl.signal);
        // Kandidat gagal (body null) = coba host alternatif; kandidat sukses
        // langsung di-stream, tanpa menunggu kandidat lain / buffering.
        if (body) return imageResponse(body, contentType, etag);
        lastErr = new Error("upstream-unavailable");
      } catch (e) {
        lastErr = e;
        if (ctrl.signal.aborted) break;
      }
    }
    throw lastErr ?? new Error("upstream-unavailable");
  } catch {
    return Response.json(
      { error: { message: "Gagal mengambil gambar.", source: "upstream" } },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
