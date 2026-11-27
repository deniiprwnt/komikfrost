/**
 * lib/api/voratoon.ts - cover dari VoraToon (https://13.voratoon.com).
 *
 * Situs ini tidak punya pencarian sisi-server dan URL cover-nya bertanda tangan
 * S3 (berlaku ~6 hari, tanpa tanda tangan = 403). Jadi: tebak slug dari judul,
 * muat /series/<slug>, lalu ambil URL cover bertanda tangan dari HTML-nya.
 * Slug yang tidak ada dijawab HTTP 200 dengan halaman "Komik Tidak Ditemukan",
 * jadi keberadaan komik dideteksi dari ada/tidaknya URL cover di halaman.
 * Tidak ketemu / gagal = null (pemanggil memakai cover 3 sumber).
 */

const VORA_BASE = "https://13.voratoon.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** URL bertanda tangan berlaku ~6 hari; 12 jam aman. */
const TTL_HIT = 12 * 60 * 60 * 1000;
const TTL_MISS = 60 * 60 * 1000;
const TTL_ERROR = 5 * 60 * 1000;
const CACHE_MAX = 2000;

const cache = new Map<string, { url: string | null; exp: number }>();
const inflight = new Map<string, Promise<string | null>>();

export function slugify(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019\u2018`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Kandidat slug (maks 3): judul penuh, tanpa kurung akhir, tanpa semua kurung. */
export function slugCandidates(title: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const v = slugify(s);
    if (v && !out.includes(v)) out.push(v);
  };
  add(title);
  add(title.replace(/\s*[(\[][^()\[\]]*[)\]]\s*$/, ""));
  add(title.replace(/\s*[(\[][^()\[\]]*[)\]]/g, " "));
  return out.slice(0, 3);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ambil URL cover bertanda tangan dari HTML halaman series (null bila tak ada). */
export function extractCover(html: string, slug: string): string | null {
  if (/Komik Tidak Ditemukan/i.test((html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "")) return null;
  const re = new RegExp(
    `https://cvr\\.voratoon\\.id/prod/series/${escapeRe(slug)}/cover/[^"'\\\\ <)]+`,
    "g",
  );
  for (const m of html.matchAll(re)) {
    const u = m[0].replace(/&amp;/g, "&");
    if (u.includes("X-Amz-Signature=")) return u;
  }
  return null;
}

async function fetchSeriesCover(slug: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7_000);
  try {
    const res = await fetch(`${VORA_BASE}/series/${slug}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return extractCover(await res.text(), slug);
  } finally {
    clearTimeout(timer);
  }
}

async function resolve(title: string): Promise<{ url: string | null; ok: boolean }> {
  let failed = false;
  for (const slug of slugCandidates(title)) {
    try {
      const url = await fetchSeriesCover(slug);
      if (url) return { url, ok: true };
    } catch {
      failed = true;
    }
  }
  return { url: null, ok: !failed };
}

/** URL cover VoraToon (mentah, belum diproksikan) untuk satu judul, atau null. */
export async function fetchVoraCover(rawTitle: string): Promise<string | null> {
  const title = rawTitle.trim();
  if (!title) return null;
  const key = title.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const r = await resolve(title);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { url: r.url, exp: Date.now() + (r.url ? TTL_HIT : r.ok ? TTL_MISS : TTL_ERROR) });
    return r.url;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
