"use client";

/**
 * Memori navigasi PWA: penanda back/forward + posisi gulir per URL.
 *
 * Kenapa perlu: App Router memasang ulang komponen halaman setiap navigasi,
 * sehingga (a) browser tidak bisa memulihkan gulir karena dokumen sempat
 * setinggi skeleton, dan (b) tidak ada cara membedakan "maju" dari "kembali".
 * Modul ini menyimpan posisi gulir sendiri lalu memulihkannya HANYA untuk
 * back/forward — maju selalu mulai dari atas, seperti aplikasi native.
 */

const STORE_KEY = "kf.navscroll";
/** Posisi lebih tua dari ini dibuang agar sessionStorage tidak menumpuk. */
const MAX_AGE_MS = 6 * 60 * 60_000;

/** URL halaman saat ini (path + query, tanpa hash). */
export function urlKey(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

/* ---------------------------------------------------------------------- */
/* Jenis navigasi                                                          */
/* ---------------------------------------------------------------------- */

let popTarget: string | null = null;

/**
 * Dipanggil dari listener `popstate` — SEBELUM router Next memproses event
 * yang sama, sehingga render berikutnya sudah tahu ini navigasi kembali.
 */
export function markPopNav(): void {
  popTarget = urlKey();
  // Gulir masih di posisi halaman lama sampai restore berjalan; jangan
  // sampai posisi itu tersimpan sebagai posisi halaman TUJUAN.
  suppressSave(popTarget, 2500);
}

/** true bila navigasi yang sedang diproses adalah back/forward ke `key`. */
export function isPopNav(key?: string): boolean {
  return popTarget !== null && popTarget === (key ?? urlKey());
}

/**
 * Selesaikan penanda untuk `key`. Mengembalikan true bila ini back/forward.
 * Penanda dibuang saat navigasi berikutnya menuju URL LAIN, supaya push ke
 * URL yang pernah dikunjungi tidak salah dianggap "kembali".
 */
export function resolvePopNav(key: string): boolean {
  if (popTarget === null) return false;
  if (popTarget === key) return true;
  popTarget = null;
  return false;
}

/* ---------------------------------------------------------------------- */
/* Penyimpanan posisi                                                      */
/* ---------------------------------------------------------------------- */

type Point = { y: number; at: number };

let store: Record<string, Point> | null = null;
let writeTimer = 0;
/** URL yang posisinya sedang dipulihkan — simpanan diabaikan sementara. */
let suppressKey: string | null = null;
let suppressUntil = 0;

function suppressSave(key: string, ms: number): void {
  suppressKey = key;
  suppressUntil = Date.now() + ms;
}

function readStore(): Record<string, Point> {
  if (store) return store;
  store = {};
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Point>;
      if (parsed && typeof parsed === "object") store = parsed;
    }
  } catch {
    // storage diblokir / data rusak — mulai kosong
  }
  return store;
}

function writeNow(): void {
  if (writeTimer) {
    window.clearTimeout(writeTimer);
    writeTimer = 0;
  }
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(store ?? {}));
  } catch {
    // kuota penuh / mode privat — memori di halaman ini tetap bekerja
  }
}

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = window.setTimeout(writeNow, 250);
}

/** Simpan posisi gulir halaman `key` (dipanggil saat menggulir, hemat rAF).
 *  `force` melewati penahan sementara — dipakai saat meninggalkan halaman,
 *  di mana posisi itu justru yang paling penting untuk dipulihkan nanti. */
export function saveScroll(key: string, y: number, force = false): void {
  if (!key) return;
  if (!force && suppressKey === key && Date.now() < suppressUntil) return;
  const s = readStore();
  const prev = s[key];
  if (prev && Math.abs(prev.y - y) < 2) return;
  s[key] = { y: Math.max(0, Math.round(y)), at: Date.now() };
  scheduleWrite();
}

/** Tahan penulisan posisi `key` selama `ms` — dipakai saat halaman
 *  ditinggalkan, agar gulir ke atas oleh router tidak menimpa posisi asli. */
export function holdScrollSave(key: string, ms: number): void {
  if (key) suppressSave(key, ms);
}

/** Posisi tersimpan untuk `key`, atau null bila tidak ada / kedaluwarsa. */
export function readScroll(key: string): number | null {
  const s = readStore();
  const hit = s[key];
  if (!hit) return null;
  if (Date.now() - hit.at > MAX_AGE_MS) {
    delete s[key];
    return null;
  }
  return Math.max(0, Math.round(hit.y));
}

/** Tulis segera (dipakai saat aplikasi disembunyikan / ditutup PWA). */
export function flushScrollStore(): void {
  if (store) writeNow();
}

/**
 * Pulihkan gulir ke `y` setelah dokumen cukup tinggi.
 *
 * Konten masuk asinkron (cache → skeleton → data), jadi tinggi dokumen
 * berubah-ubah. Percobaan diulang tiap frame sampai posisi tercapai atau
 * batas waktu habis — inilah yang mencegah "kembali selalu ke atas" karena
 * browser menempelkan posisi ke tinggi dokumen sementara.
 */
export function restoreScroll(y: number, timeoutMs = 3000): () => void {
  if (typeof window === "undefined") return () => {};
  if (!Number.isFinite(y) || y <= 0) return () => {};

  if (typeof document !== "undefined") {
    suppressSave(urlKey(), timeoutMs + 500);
  }

  let raf = 0;
  let timer = 0;
  let done = false;
  let stable = 0;
  let lastMax = -1;
  const deadline = performance.now() + timeoutMs;

  const apply = (): boolean => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(y, max), behavior: "instant" as ScrollBehavior });
    return max >= y - 1 && Math.abs(window.scrollY - y) <= 2;
  };

  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    window.removeEventListener("wheel", onUser, true);
    window.removeEventListener("touchstart", onUser, true);
    window.removeEventListener("keydown", onUser, true);
  };

  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
  };

  /** User mulai menggulir sendiri — jangan tahan posisinya lagi. */
  function onUser() {
    finish();
  }

  const tick = () => {
    raf = 0;
    if (done) return;
    const ok = apply();
    // Tinggi dokumen masih berubah (gambar/teks masuk) → posisi bisa
    // bergeser walau angka sudah "pas". Tahan sampai ukuran stabil, supaya
    // gulir tidak melompat ~100 px setelah pemulihan selesai.
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    stable = max === lastMax ? stable + 1 : 0;
    lastMax = max;
    if ((ok && stable >= 12) || performance.now() > deadline) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  // Batas keras: jangan pernah menahan gulir lebih lama dari ini.
  timer = window.setTimeout(() => {
    apply();
    finish();
  }, timeoutMs);

  window.addEventListener("wheel", onUser, { capture: true, passive: true });
  window.addEventListener("touchstart", onUser, { capture: true, passive: true });
  window.addEventListener("keydown", onUser, true);

  // Langsung posisikan sekarang (masih di dalam efek render) supaya frame
  // pertama yang dilukis sudah di tempat tujuan — bukan posisi halaman lama.
  tick();

  return finish;
}
