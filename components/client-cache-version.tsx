"use client";

import { useEffect, useRef } from "react";
import { apiGet, invalidateApi } from "@/lib/client";
import { DATA_VERSION } from "@/lib/api/cache";
import { useHistory } from "@/lib/history";
import { EMPTY_KEY, markCoverPending, markCoverSettled, onBrokenCover, resetCoverKey } from "@/components/cover-heal";
import type { MangaDetail } from "@/lib/api/types";

/**
 * Invalidasi cache DATA LAMA di sisi klien + pemulihan sampul riwayat.
 *
 * 1. Saat DATA_VERSION server naik, semua snapshot localStorage yang dibuat
 *    versi lama (genre Bahasa Indonesia, sinopsis mentah, sampul placeholder)
 *    dibuang dan cache memori klien dikosongkan. Sekali per versi.
 * 2. Entri riwayat yang tersimpan TANPA sampul (terjadi bila chapter dibuka
 *    langsung sehingga cache detail kosong — kasus Limit Breaker di
 *    "Lanjut membaca"/Riwayat) atau dengan sampul/judul yang berbeda dari
 *    record gabungan diisi ulang dari `/api/manga/[slug]`, sehingga jalur
 *    sampulnya sama dengan halaman detail.
 *
 * Tidak merender apa pun; dipasang sekali di layout.
 */

const VERSION_KEY = "kf.data-version";
const SNAP_PREFIX = "kf.snap:";

/** Kunci penyimpanan riwayat (lib/history.ts) — harus sama persis. */
const HISTORY_KEY = "bk-history-v1";
/** Penanda "sampul riwayat sudah diselaraskan" per versi data. */
const HEAL_KEY = "kf.hist-heal";
const HEAL_TTL_MS = 24 * 60 * 60_000;
const HEAL_CAP = 12;
const MAX_TRIES = 2;

/** Sampul yang jelas tidak valid: bukan string, placeholder, atau bukan URL. */
function isBadCover(c: unknown): boolean {
  if (typeof c !== "string") return true;
  const v = c.trim();
  if (!v) return true;
  if (/^(undefined|null|nan)$/i.test(v)) return true;
  if (/placeholder|no-?image|noimage|default[-_.]?cover/i.test(v)) return true;
  return !(/^https?:\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:image/"));
}

/**
 * Bersihkan entri riwayat cacat saat DATA_VERSION naik:
 * - entri tanpa slug/route/judul valid dibuang (tak bisa dibuka/ditampilkan);
 * - slug ganda digabung (entri terbaru menang, sampul valid dipertahankan);
 * - sampul rusak dikosongkan agar dipulihkan dari detail gabungan —
 *   progres, bab, dan waktu baca TIDAK disentuh.
 */
function sanitizeHistory(): void {
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) return;
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(HISTORY_KEY);
    return;
  }
  if (!Array.isArray(arr)) {
    window.localStorage.removeItem(HISTORY_KEY);
    return;
  }
  const seen = new Map<string, StoredEntry>();
  const order: string[] = [];
  let changed = false;
  for (const item of arr as unknown[]) {
    const e = item as StoredEntry & { route?: unknown };
    const okShape =
      !!e &&
      typeof e === "object" &&
      typeof e.slug === "string" &&
      e.slug.trim() !== "" &&
      typeof e.route === "string" &&
      (e.route as string).startsWith("/") &&
      typeof e.title === "string" &&
      e.title.trim() !== "";
    if (!okShape) {
      changed = true;
      continue;
    }
    const out: StoredEntry = { ...e };
    if (isBadCover(out.cover)) {
      if (out.cover !== "") changed = true;
      out.cover = "";
    }
    const prev = seen.get(out.slug);
    if (prev) {
      changed = true;
      if (!prev.cover && out.cover) prev.cover = out.cover;
      continue;
    }
    seen.set(out.slug, out);
    order.push(out.slug);
  }
  if (!changed) return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(order.map((k) => seen.get(k))));
  // useHistory sudah membaca data lama saat mount — beri tahu agar memuat ulang.
  window.dispatchEvent(new CustomEvent("bk-history-changed"));
}

function wipeClientCaches(): void {
  try {
    if (window.localStorage.getItem(VERSION_KEY) === DATA_VERSION) return;
  } catch {
    // storage diblokir — cache memori tetap perlu dibersihkan
  }
  invalidateApi();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(SNAP_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
    // Entri riwayat cacat dibersihkan juga (bukan hanya kf.snap:).
    sanitizeHistory();
    window.localStorage.removeItem(HEAL_KEY);
    window.localStorage.setItem(VERSION_KEY, DATA_VERSION);
  } catch {
    // kuota/mode privat — cache memori sudah dikosongkan
  }
}

/** Peta slug → waktu terakhir sampulnya diselaraskan (hanya versi data ini). */
function readHealed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(HEAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: string; at?: Record<string, number> };
    if (parsed.v !== DATA_VERSION || !parsed.at) return {};
    return parsed.at;
  } catch {
    return {};
  }
}

function markHealed(slug: string): void {
  try {
    const at = readHealed();
    at[slug] = Date.now();
    window.localStorage.setItem(HEAL_KEY, JSON.stringify({ v: DATA_VERSION, at }));
  } catch {
    // kuota/diblokir — sampul diselaraskan ulang pada pemuatan berikutnya
  }
}

interface StoredEntry {
  slug: string;
  title?: string;
  cover?: string;
  [k: string]: unknown;
}

/**
 * Tambal sampul/judul SATU entri riwayat di tempat. Urutan, waktu baca
 * (`updatedAt`), bab, dan progres tidak disentuh — memakai saveHistory akan
 * memindahkan entri ke paling atas dan menimpa waktu bacanya. Dibaca ulang
 * dari storage tepat sebelum menulis, jadi progres yang baru disimpan
 * pembaca tidak tertimpa data basi.
 */
function patchHistoryEntry(slug: string, patch: { cover?: string; title?: string }): boolean {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return false;
    let changed = false;
    const next = (arr as StoredEntry[]).map((e) => {
      if (!e || e.slug !== slug) return e;
      const out: StoredEntry = { ...e };
      if (patch.cover && e.cover !== patch.cover) {
        out.cover = patch.cover;
        changed = true;
      }
      if (patch.title && e.title !== patch.title) {
        out.title = patch.title;
        changed = true;
      }
      return out;
    });
    if (!changed) return false;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("bk-history-changed"));
    return true;
  } catch {
    // storage penuh/diblokir — riwayat tetap apa adanya
    return false;
  }
}

export function ClientDataVersion() {
  const { entries } = useHistory();
  /** Slug yang sudah selesai diselaraskan pada sesi halaman ini. */
  const done = useRef(new Set<string>());
  /** Slug yang sedang diproses (hindari fetch ganda antar render). */
  const busy = useRef(new Set<string>());
  const tries = useRef(new Map<string, number>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    wipeClientCaches();
    return () => {
      alive.current = false;
    };
  }, []);

  // Selaraskan sampul riwayat dengan record gabungan. Efek ini bergantung
  // pada `entries` dan TIDAK terkunci sekali jalan: `useHistory` mengisi
  // `entries` SETELAH mount (state awal kosong), jadi pemicu "sekali saja"
  // dulu habis pada render pertama yang kosong dan tak pernah memulihkan
  // apa pun. Sekarang tiap kali daftar tersedia/berubah (termasuk saat
  // pembaca menyimpan entri baru tanpa sampul), entri yang belum
  // diselaraskan diproses — konkurensi 2 agar ramah rate limit.
  useEffect(() => {
    if (entries.length === 0) {
      // Riwayat kosong (atau belum terbaca): beri jeda singkat lalu lepaskan
      // skeleton agar cover kosong di tempat lain tidak menunggu pemulih.
      const id = window.setTimeout(() => markCoverSettled(EMPTY_KEY), 1500);
      return () => window.clearTimeout(id);
    }
    const healed = readHealed();
    const now = Date.now();
    const todo = entries
      .slice(0, HEAL_CAP)
      .filter((e) => {
        if (done.current.has(e.slug) || busy.current.has(e.slug)) return false;
        if ((tries.current.get(e.slug) ?? 0) >= MAX_TRIES) return false;
        // Tanpa sampul → selalu diproses. Bila ada sampul, lewati yang sudah
        // diselaraskan dalam 24 jam terakhir (versi data yang sama).
        if (!e.cover) return true;
        const at = healed[e.slug];
        return !(typeof at === "number" && now - at < HEAL_TTL_MS);
      })
      // Yang kosong dulu.
      .sort((a, b) => Number(Boolean(a.cover)) - Number(Boolean(b.cover)));
    if (todo.length === 0) {
      // Tidak ada yang perlu dipulihkan: lepaskan skeleton entri tanpa sampul
      // (yang gagal dipulihkan menampilkan placeholder), kecuali masih ada
      // fetch yang berjalan untuk entri kosong.
      const inflight = entries.some((e) => !e.cover && busy.current.has(e.slug));
      if (!inflight) markCoverSettled(EMPTY_KEY);
      return;
    }
    if (todo.some((e) => !e.cover)) markCoverPending(EMPTY_KEY);
    for (const e of todo) busy.current.add(e.slug);
    const queue = [...todo];
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && alive.current) {
        const e = queue.shift();
        if (!e) break;
        try {
          // Detail GABUNGAN (bukan ?ringkas=1): sampul yang dipakai adalah
          // sampul sumber prioritas tertinggi — jalur yang sama dengan
          // halaman detail.
          const d = await apiGet<MangaDetail>(`/api/manga/${encodeURIComponent(e.slug)}`);
          if (!alive.current) break;
          if (d?.cover) {
            patchHistoryEntry(e.slug, {
              cover: d.cover,
              ...(d.title ? { title: d.title } : {}),
            });
            done.current.add(e.slug);
            markHealed(e.slug);
          } else {
            tries.current.set(e.slug, (tries.current.get(e.slug) ?? 0) + 1);
          }
        } catch {
          // Gagal satu judul — dicoba lagi (maks 2x) saat daftar berubah.
          tries.current.set(e.slug, (tries.current.get(e.slug) ?? 0) + 1);
        } finally {
          busy.current.delete(e.slug);
        }
      }
      // Sisa antrean (komponen dilepas) dilepaskan dari penanda sibuk.
      for (const e of queue) busy.current.delete(e.slug);
    };
    void Promise.all([worker(), worker()]).then(() => {
      // Semua upaya untuk entri tanpa sampul selesai: yang masih kosong
      // (gagal total) boleh menampilkan placeholder.
      if (alive.current) markCoverSettled(EMPTY_KEY);
    });
  }, [entries]);

  // Sampul yang SEMUA kandidatnya gagal (dilaporkan CoverImage): cari sampul
  // pengganti dari detail gabungan (cover + coverCandidates) dan tulis ke
  // entri riwayat yang memakainya. Placeholder baru tampil bila tak ada
  // pengganti. Kunci diselesaikan SETELAH patch agar tidak berkedip.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    const off = onBrokenCover((src) => {
      const owners = entriesRef.current.filter((e) => e.cover === src);
      if (owners.length === 0) {
        markCoverSettled(src);
        return;
      }
      void (async () => {
        let replaced = false;
        for (const e of owners.slice(0, 3)) {
          try {
            const d = await apiGet<MangaDetail>(`/api/manga/${encodeURIComponent(e.slug)}`);
            const next = [d?.cover, ...(d?.coverCandidates ?? [])].find(
              (c): c is string => typeof c === "string" && c.trim() !== "" && c !== src,
            );
            if (next && patchHistoryEntry(e.slug, { cover: next, ...(d?.title ? { title: d.title } : {}) })) {
              replaced = true;
              markHealed(e.slug);
            }
          } catch {
            // dicoba lagi hanya bila sampul dilaporkan ulang pada sesi baru
          }
        }
        if (replaced) resetCoverKey(src);
        markCoverSettled(src);
      })();
    });
    return off;
  }, []);

  return null;
}
