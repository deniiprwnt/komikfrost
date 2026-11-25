"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComicSourceId } from "./api/types";

/** Satu entri riwayat baca — disimpan per perangkat di localStorage. */
export interface HistoryEntry {
  /** slug komik, mis. "blue-lock" */
  slug: string;
  /** judul komik untuk ditampilkan */
  title: string;
  /** cover komik (boleh kosong bila belum pernah termuat) */
  cover: string;
  /** Tipe komik (Manga/Manhwa/Manhua) saat terakhir dibaca — badge kartu. */
  type?: string;
  /** Sumber data komik saat terakhir dibaca — badge kartu. */
  sources?: ComicSourceId[];
  /** nomor chapter ala Komiku, mis. "360" atau "11-2" */
  chapter: string;
  /** label tampilan, mis. "Chapter 360" */
  chapterLabel: string;
  /** route internal tujuan lanjutkan, mis. "/baca/blue-lock/360" */
  route: string;
  /** progres halaman 0..1 terakhir (untuk "terakhir di hal. X") */
  progress: number;
  /**
   * Indeks gambar 0-based terakhir terlihat (untuk lanjutkan di posisi
   * yang sama saat chapter dibuka ulang — dipakai mode Halaman maupun Scroll).
   */
  page?: number;
  /** timestamp ms terakhir dibaca */
  updatedAt: number;
}

const KEY = "bk-history-v1";
const MAX = 50;

function readAll(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is HistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as HistoryEntry).slug === "string" &&
        typeof (e as HistoryEntry).route === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // Storage penuh/diblokir — riwayat sekadar tidak tersimpan.
  }
}

/** Simpan/update posisi baca satu komik (selalu paling atas, maks 50). */
export function saveHistory(entry: Omit<HistoryEntry, "updatedAt">): HistoryEntry[] {
  const prev = readAll();
  const old = prev.find((e) => e.slug === entry.slug);
  const next: HistoryEntry = { ...entry, updatedAt: Date.now() };
  // Jangan timpa cover yang sudah tersimpan dengan string kosong
  // (mis. cache detail tidak tersedia saat chapter dibuka langsung —
  // `rest` sudah membuang entri lama jadi cari di `prev`).
  if (!next.cover && old?.cover) next.cover = old.cover;
  // Tipe/sumber tidak diketahui saat membuka chapter langsung (cache detail
  // kosong) — jangan hapus badge yang sudah tersimpan.
  if (!next.type && old?.type) next.type = old.type;
  if (!next.sources?.length && old?.sources?.length) next.sources = old.sources;
  const all = [next, ...prev.filter((e) => e.slug !== entry.slug)].slice(0, MAX);
  writeAll(all);
  window.dispatchEvent(new CustomEvent("bk-history-changed"));
  return all;
}

/** Hapus satu komik dari riwayat. */
export function removeHistory(slug: string): HistoryEntry[] {
  const all = readAll().filter((e) => e.slug !== slug);
  writeAll(all);
  window.dispatchEvent(new CustomEvent("bk-history-changed"));
  return all;
}

/** Hapus seluruh riwayat. */
export function clearHistory(): HistoryEntry[] {
  writeAll([]);
  window.dispatchEvent(new CustomEvent("bk-history-changed"));
  return [];
}

/* ---- Penanda chapter yang sudah dibaca (per komik, per perangkat) ---- */

const READ_KEY = "bk-read-v1";
const READ_MAX_SLUGS = 200;

/** Samakan bentuk token chapter: "18", "18-bahasa-indonesia", "<slug>-chapter-18" â†’ "18"; "11.2" â†’ "11-2". */
export function readKey(tok: string): string {
  const bare = tok.replace(/-bahasa-indonesia$/i, "").replace(/^(?:.*-)?chapter-/i, "");
  return (bare || tok).replace(/(\d)\.(\d)/g, "$1-$2").toLowerCase();
}

function readReadMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return obj as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Tandai satu chapter sudah dibaca. */
export function markChapterRead(slug: string, tok: string): void {
  const key = readKey(tok);
  if (!slug || !key) return;
  const map = readReadMap();
  const list = Array.isArray(map[slug]) ? map[slug] : [];
  if (list.includes(key)) return;
  // Komik yang baru dibaca dipindah ke akhir; yang tertua dibuang bila melebihi batas.
  delete map[slug];
  map[slug] = [...list, key];
  const slugs = Object.keys(map);
  for (const s of slugs.slice(0, Math.max(0, slugs.length - READ_MAX_SLUGS))) delete map[s];
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(map));
  } catch {
    // Storage penuh/diblokir â€” tanda baca sekadar tidak tersimpan.
  }
  window.dispatchEvent(new CustomEvent("bk-read-changed"));
}

/** Hook reaktif: kumpulan kunci chapter (lihat readKey) yang sudah dibaca untuk satu komik. */
export function useReadChapters(slug: string): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const refresh = () => {
      const list = readReadMap()[slug];
      setSet(new Set(Array.isArray(list) ? list : []));
    };
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === READ_KEY) refresh();
    };
    window.addEventListener("bk-read-changed", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("bk-read-changed", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [slug]);
  return set;
}

/** Ambil satu entri berdasarkan slug (untuk tombol "Lanjutkan"). */
export function getHistoryEntry(slug: string): HistoryEntry | null {
  return readAll().find((e) => e.slug === slug) ?? null;
}

/** Hook reaktif: daftar riwayat terbaru dulu, ter-update lintas tab/halaman. */
export function useHistory(): {
  entries: HistoryEntry[];
  remove: (slug: string) => void;
  clear: () => void;
  refresh: () => void;
} {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const refresh = useCallback(() => setEntries(readAll()), []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) refresh();
    };
    window.addEventListener("bk-history-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("bk-history-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const remove = useCallback((slug: string) => {
    setEntries(removeHistory(slug));
  }, []);

  const clear = useCallback(() => {
    setEntries(clearHistory());
  }, []);

  return { entries, remove, clear, refresh };
}

/** Label waktu relatif: "12 detik lalu", "5 menit lalu", "3 jam lalu",
 *  "2 hari lalu" — hanya SATU satuan (terbesar).
 *  `now` opsional agar pemanggil bisa memakai detak bersama (`useNowTick`) —
 *  label tidak membeku sampai ada render lain. */
export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - ts) / 1000));
  // Konsisten dengan formatAgo (lib/relative-time.ts): tick bersama
  // sekarang 15 dtk, jadi label detik tidak akurat lagi.
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} bulan`;
  return `${Math.floor(mo / 12)} tahun`;
}
