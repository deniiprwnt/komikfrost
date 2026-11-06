/**
 * Client fetcher untuk API internal (/api/*).
 * Mengembalikan `data` atau melempar Error berisi pesan + source Komiku.
 *
 * Dilengkapi cache memori singkat + dedupe request:
 * - Navigasi bolak-balik (komik → chapter → kembali) tidak fetch ulang
 *   selama data masih segar (TTL 30 detik).
 * - Komponen yang me-request URL sama bersamaan hanya memicu 1 fetch.
 * - `stale` true = data basi (< 5 menit) dikembalikan langsung sambil
 *   fetch baru jalan di background (stale-while-revalidate) — layar
 *   tampil instan lalu diperbarui diam-diam saat data segar tiba.
 */

export interface ApiSuccess<T> {
  data: T;
}

const TTL_MS = 30_000; // 30 detik — data segar, tanpa jaringan.
/** Batas data basi yang masih layak tampil sambil disegarkan: 5 menit. */
const STALE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function fetchJson<T>(path: string, signal?: AbortSignal, noStore = false): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    signal,
    ...(noStore ? { cache: "no-store" as RequestCache } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) {
    const msg =
      json?.error?.message ||
      `Gagal memuat data (HTTP ${res.status}). Coba lagi nanti.`;
    throw new Error(msg);
  }
  return (json as ApiSuccess<T>).data;
}

export async function apiGet<T>(
  path: string,
  opts?: { signal?: AbortSignal; noStore?: boolean },
): Promise<T> {
  // `noStore` (cek background auto-refresh): lewati cache memori baca/tulis
  // + cache HTTP browser agar benar-benar menembak server. Dedupe inflight
  // tetap dipakai supaya pemanggil bersamaan (2 section beranda) = 1 fetch.
  if (opts?.noStore && !opts?.signal) {
    const pending = inflight.get(path);
    if (pending) return pending as Promise<T>;
    const p = fetchJson<T>(path, undefined, true).finally(() => {
      if (inflight.get(path) === p) inflight.delete(path);
    });
    inflight.set(path, p);
    return p;
  }
  // Data segar dari cache — tanpa round-trip jaringan sama sekali.
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS && !opts?.signal) {
    return hit.data as T;
  }

  const pending = inflight.get(path);
  if (pending && !opts?.signal) return pending as Promise<T>;

  const p = fetchJson<T>(path, opts?.signal)
    .then((data) => {
      cache.set(path, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      if (inflight.get(path) === p) inflight.delete(path);
    });
  if (!opts?.signal) inflight.set(path, p);
  return p;
}

/**
 * Stale-while-revalidate: kembalikan data basi seketika (kalau ada),
 * sambil fetch baru di background. `onFresh` dipanggil saat data segar
 * tiba agar UI diperbarui diam-diam. Mengembalikan `{ data, stale }`.
 */
export async function apiGetSWR<T>(
  path: string,
  onFresh: (data: T) => void,
  onError?: (err: unknown) => void,
): Promise<{ data: T | null; stale: boolean }> {
  const hit = cache.get(path);
  const fresh = hit && Date.now() - hit.at < TTL_MS;
  if (fresh) return { data: hit.data as T, stale: false };
  if (hit && Date.now() - hit.at < STALE_MS) {
    // Basi tapi layak tampil — segarkan di background LEWAT apiGet agar
    // beberapa pemanggil bersamaan (mis. 3 section beranda) hanya memicu
    // 1 fetch (dedupe inflight); onFresh tiap pemanggil tetap dipicu.
    apiGet<T>(path).then(
      (data) => {
        try {
          onFresh(data);
        } catch {
          // abaikan listener rusak
        }
      },
      (err) => {
        // Background refresh boleh gagal diam-diam — data basi tetap tampil —
        // tapi pemanggil diberitahu agar spinner ikut mati, bukan muter terus.
        onError?.(err);
      },
    );
    return { data: hit.data as T, stale: true };
  }
  const data = await apiGet<T>(path);
  return { data, stale: false };
}

/** Intip cache tanpa fetch — untuk melengkapi data tanpa request tambahan. */
export function peekApiCache<T>(path: string): T | null {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  return null;
}

/**
 * Intip cache termasuk yang BASI (< 5 menit) — tampilkan dulu, segarkan
 * di background. Menghindari skeleton padahal datanya sudah ada di memori.
 */
export function peekApiCacheStale<T>(path: string): T | null {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < STALE_MS) return hit.data as T;
  return null;
}

/** Panaskan cache sebelum user membuka halaman — dipanggil saat hover/touch. */
export function prefetchApi(path: string): void {
  if (typeof window === "undefined") return;
  if (cache.has(path) || inflight.has(path)) return;
  void apiGet(path).catch(() => {
    // Prefetch boleh gagal diam-diam; halaman tujuan akan fetch ulang.
  });
}

/** Hapus cache satu URL (mis. setelah retry) atau semuanya. */
export function invalidateApi(path?: string): void {
  if (path) cache.delete(path);
  else cache.clear();
}

/**
 * Kunci dedupe judul lintas-halaman (mirror `normalizeTitle` server di
 * lib/api/aggregator.ts — duplikat di sini agar komponen client tidak
 * membundel modul server). Lowercase + NFKD + strip diakritik +
 * dash/underscore → spasi + tanda baca → spasi.
 */
export function titleKey(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[-------_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
