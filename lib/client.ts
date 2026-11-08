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

/**
 * Snapshot daftar ke localStorage — supaya REFRESH halaman (yang menghapus
 * cache memori) tetap langsung terisi, bukan skeleton 2-6 detik menunggu
 * scrape tiga sumber. Data tetap divalidasi ulang di background; label
 * "x menit lalu" dihitung dari `updatedAtTs`, jadi tidak ikut membeku.
 */
const SNAP_PREFIX = "kf.snap:";
const SNAP_TTL_MS = 6 * 60 * 60_000; // 6 jam — lebih tua dari itu, buang.
const SNAP_MAX_CHARS = 250_000; // jaga kuota localStorage (~5 MB)

function snapshotAllowed(path: string): boolean {
  return (
    path.startsWith("/api/latest") ||
    path === "/api/home" ||
    path.startsWith("/api/popular") ||
    path.startsWith("/api/genre/")
  );
}

export function readApiSnapshot<T>(path: string): T | null {
  if (typeof window === "undefined" || !snapshotAllowed(path)) return null;
  try {
    const raw = window.localStorage.getItem(SNAP_PREFIX + path);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: T };
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > SNAP_TTL_MS) {
      window.localStorage.removeItem(SNAP_PREFIX + path);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Buang snapshot kedaluwarsa / berlebih. Snapshot ditulis per path
 * (semua kombinasi filter & halaman /api/latest), jadi tanpa sapuan ini
 * localStorage lama-lama penuh dan penulisan baru gagal diam-diam.
 */
function pruneSnapshots(): void {
  try {
    const now = Date.now();
    const alive: { key: string; at: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(SNAP_PREFIX)) continue;
      let at = 0;
      try {
        at = (JSON.parse(window.localStorage.getItem(key) || "{}") as { at?: number }).at ?? 0;
      } catch {
        at = 0;
      }
      if (!at || now - at > SNAP_TTL_MS) window.localStorage.removeItem(key);
      else alive.push({ key, at });
    }
    // Sisakan 40 snapshot terbaru.
    alive.sort((a, b) => b.at - a.at);
    for (const { key } of alive.slice(40)) window.localStorage.removeItem(key);
  } catch {
    // storage diblokir — abaikan
  }
}

function writeApiSnapshot(path: string, data: unknown): void {
  if (typeof window === "undefined" || !snapshotAllowed(path)) return;
  try {
    const raw = JSON.stringify({ at: Date.now(), data });
    if (raw.length > SNAP_MAX_CHARS) return;
    window.localStorage.setItem(SNAP_PREFIX + path, raw);
    pruneSnapshots();
  } catch {
    // Kuota penuh / mode privat — cache memori tetap bekerja.
    pruneSnapshots();
  }
}

async function fetchJson<T>(path: string, signal?: AbortSignal, noStore = false): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    signal,
    ...(noStore ? { cache: "no-store" as RequestCache } : {}),
  });
  const json = await res.json().catch(() => null);
  // Sesi gate kedaluwarsa/hilang: kirim user ke halaman masuk dengan
  // tujuan kembali, bukan menampilkan "Akses terkunci" di setiap halaman.
  if (res.status === 401 && typeof window !== "undefined") {
    const here = window.location.pathname + window.location.search;
    if (!here.startsWith("/masuk")) {
      window.location.href = `/masuk?next=${encodeURIComponent(here)}`;
      // Beri waktu navigasi berjalan sebelum promise ditolak. Timeout
      // sebagai jaring pengaman: bila navigasi gagal (CSP, iframe, dsb.),
      // jangan biarkan UI macet selamanya menunggu promise abadi.
      await new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Mengalihkan ke halaman masuk...")), 5000),
      );
    }
  }
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
    const p = fetchJson<T>(path, undefined, true)
      .then((data) => {
        // Hasil probe = data paling baru → ikut jadi cache memori supaya
        // pindah halaman lalu kembali tidak menampilkan daftar yang lebih tua.
        cache.set(path, { at: Date.now(), data });
        writeApiSnapshot(path, data);
        return data;
      })
      .finally(() => {
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
      writeApiSnapshot(path, data);
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
  // Entri BASI tetap perlu disegarkan — dulu `cache.has(path)` membuat
  // prefetch tidak melakukan apa pun selama entri lama masih di Map,
  // sehingga hover/touch setelah 30 dtk tidak memanaskan apa pun.
  const hit = cache.get(path);
  if ((hit && Date.now() - hit.at < TTL_MS) || inflight.has(path)) return;
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
