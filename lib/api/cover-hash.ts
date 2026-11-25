/**
 * lib/api/cover-hash.ts â€” hash visual sampul untuk dedupe lintas sumber.
 *
 * Latar: satu judul bisa tampil dengan terjemahan judul berbeda total di tiap
 * sumber ("Return of the Disaster-Class Hero" vs "Resurrection of the
 * Catastrophic Hero") dan file sampulnya berada di host berbeda dengan nama
 * file berbeda, sehingga kunci judul maupun `coverIdentity` tidak cocok.
 * Gambarnya tetap sama: dHash 64-bit keduanya hanya berbeda beberapa bit,
 * sedangkan judul berbeda berjarak ~30+ bit.
 *
 * Hanya SERVER. `sharp` dimuat dinamis; bila tidak tersedia, hash dilewati
 * dan penggabungan jatuh ke aturan judul biasa (tidak pernah gagal).
 */
import {
  chapterNum,
  coverIdentity,
  mergeCards,
  normalizeKomikType,
  type MergedMangaCard,
} from "./aggregator";
import { isAllowedImageHost } from "./img-proxy";
import type { ComicSourceId, MangaCard } from "./types";

const MAX_ENTRIES = 4000;
// Kegagalan hash (timeout/jaringan) hanya diingat singkat: dulu 10 menit,
// sehingga satu unduhan gagal membuat duplikat bertahan lama.
const FAIL_RETRY_MS = 45_000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 6 * 1024 * 1024;
const CONCURRENCY = 10;
const CH_BASE = 1000; // sama dengan CHAPTER_SUB_BASE di aggregator

const cache = new Map<string, { h: string | null; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

type SharpFn = (input: Buffer) => {
  grayscale(): ReturnType<SharpFn>;
  resize(w: number, h: number, o: { fit: string }): ReturnType<SharpFn>;
  raw(): ReturnType<SharpFn>;
  toBuffer(): Promise<Buffer>;
};
let sharpMod: SharpFn | null | undefined;
async function loadSharp(): Promise<SharpFn | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    const m = (await import("sharp")) as unknown as { default?: SharpFn };
    sharpMod = (m.default ?? (m as unknown as SharpFn)) || null;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

/** URL upstream https yang boleh diambil (buka bungkus /api/img). */
function upstreamUrl(raw?: string | null): string | null {
  let u = (raw ?? "").trim();
  if (!u) return null;
  if (u.startsWith("/api/img")) {
    const m = u.match(/[?&]u=([^&]+)/);
    if (!m) return null;
    try {
      u = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  if (u.startsWith("//")) u = "https:" + u;
  else if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  try {
    const p = new URL(u);
    return p.protocol === "https:" && isAllowedImageHost(p.hostname) ? p.toString() : null;
  } catch {
    return null;
  }
}

function remember(id: string, h: string | null): void {
  cache.delete(id);
  cache.set(id, { h, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function computeHash(url: string): Promise<string | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      referer: new URL(url).origin + "/",
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  // dHash 9x8: bit = piksel kiri lebih terang dari kanannya.
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  let nib = 0;
  let ones = 0;
  for (let i = 0; i < 64; i++) {
    const y = Math.floor(i / 8);
    const x = i % 8;
    const b = px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0;
    ones += b;
    nib = (nib << 1) | b;
    if (i % 4 === 3) {
      hex += nib.toString(16);
      nib = 0;
    }
  }
  // Gambar hampir polos (placeholder/blank) tidak boleh jadi bukti.
  if (ones <= 4 || ones >= 60) return null;
  return hex;
}

function hashOne(raw: string): Promise<string | null> {
  const id = coverIdentity(raw);
  const url = upstreamUrl(raw);
  if (!id || !url) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit && (hit.h !== null || Date.now() - hit.at < FAIL_RETRY_MS)) return Promise.resolve(hit.h);
  const running = inflight.get(id);
  if (running) return running;
  const p = computeHash(url)
    .catch(() => null)
    .then((h) => {
      remember(id, h);
      inflight.delete(id);
      return h;
    });
  inflight.set(id, p);
  return p;
}

/**
 * Hash sejumlah URL sampul dalam batas waktu `budgetMs`. Yang belum selesai
 * saat tenggat tetap jalan di latar dan mengisi cache untuk request
 * berikutnya. Hasil dikunci `coverIdentity(url)`.
 */
export async function coverHashes(urls: string[], budgetMs: number): Promise<Map<string, string>> {
  const queue = [...new Set(urls)];
  const work = (async () => {
    const next = async (): Promise<void> => {
      const u = queue.shift();
      if (u === undefined) return;
      await hashOne(u);
      return next();
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, next));
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, budgetMs))]);
  const out = new Map<string, string>();
  for (const u of urls) {
    const id = coverIdentity(u);
    const h = id ? cache.get(id)?.h : null;
    if (id && typeof h === "string") out.set(id, h);
  }
  return out;
}

/**
 * Sampul yang perlu di-hash: hanya kartu yang punya "pasangan mungkin" â€”
 * kartu lain dari sumber yang TIDAK beririsan, tipe tidak bertentangan, dan
 * chapter terbaru selisih <= 3. Membatasi jumlah unduhan gambar.
 */
export function coverCandidatesForHash(cards: MergedMangaCard[], max = 60): string[] {
  const meta = cards.map((c) => ({
    c,
    hi: chapterNum(c.latestChapter?.label),
    type: normalizeKomikType(c.type),
    srcs: new Set<ComicSourceId>(c.sources ?? []),
  }));
  const need = new Set<number>();
  for (let i = 0; i < meta.length; i++) {
    const a = meta[i];
    if (!(a.hi >= 3 * CH_BASE)) continue;
    for (let j = i + 1; j < meta.length; j++) {
      const b = meta[j];
      if (!(b.hi >= 3 * CH_BASE)) continue;
      if (Math.abs(a.hi - b.hi) > 3 * CH_BASE) continue;
      if (a.type && b.type && a.type !== b.type) continue;
      if ([...a.srcs].some((s) => b.srcs.has(s))) continue;
      need.add(i);
      need.add(j);
    }
  }
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const i of need) {
    const c = meta[i].c;
    let perCard = 0;
    for (const u of [c.thumbnail, ...(c.thumbnailCandidates ?? [])]) {
      if (perCard >= 2 || urls.length >= max) break;
      const id = u ? coverIdentity(u) : "";
      if (!id || seen.has(id) || !upstreamUrl(u)) continue;
      seen.add(id);
      urls.push(u!);
      perCard++;
    }
  }
  return urls;
}

/**
 * `mergeCards` + bukti sampul visual. Gabung sekali (aturan judul), cari
 * kartu yang mungkin duplikat lintas sumber, hash sampulnya, lalu gabung
 * ulang dengan peta hash. Tanpa kandidat / tanpa hash â†’ hasil pertama.
 */
export async function mergeCardsDeep(
  lists: Partial<Record<ComicSourceId, MangaCard[]>>,
  budgetMs = 3500,
): Promise<MergedMangaCard[]> {
  const first = mergeCards(lists);
  const urls = coverCandidatesForHash(first);
  if (urls.length === 0) return first;
  const coverHash = await coverHashes(urls, budgetMs);
  if (coverHash.size < 2) return first;
  return mergeCards(lists, { coverHash });
}
