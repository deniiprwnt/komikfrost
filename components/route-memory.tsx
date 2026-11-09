"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Pelacak navigasi global — mengingat rute saat ini & sebelumnya di
 * sessionStorage agar halaman daftar (/terbaru, /genre/[slug]) bisa
 * membedakan "kembali dari komik / refresh" (daftar dipertahankan)
 * dari "masuk lagi setelah keluar" (daftar boleh mulai segar).
 *
 * Cara kerja: komponen ini tinggal di layout sehingga tidak pernah
 * unmount saat navigasi client-side. Efek halaman anak selalu jalan
 * DULUAN dibanding efek ini, jadi saat halaman daftar dipasang,
 * `bk-current-path` masih berisi rute SEBELUMNYA — persis yang
 * dibutuhkan untuk klasifikasi. Setelah itu efek ini memajukan
 * penanda (previous -> last, current -> pathname).
 */
export function RouteMemory() {
  const pathname = usePathname() ?? "";
  useEffect(() => {
    try {
      const cur = sessionStorage.getItem("bk-current-path");
      if (cur !== pathname) {
        if (cur) sessionStorage.setItem("bk-last-path", cur);
        sessionStorage.setItem("bk-current-path", pathname);
      }
    } catch {
      // storage diblokir — halaman daftar tetap jalan, hanya tanpa restore
    }
  }, [pathname]);
  return null;
}

/**
 * Rute asal saat halaman daftar pertama dirender. Dibaca sinkron saat
 * inisialisasi state (sebelum efek RouteMemory induk sempat memajukan
 * penanda), sehingga nilainya = rute sebelum navigasi ini.
 * - null = beban pertama / tab baru (tidak ada riwayat navigasi).
 * - sama dengan rute sendiri = refresh atau ganti query (?page=, filter).
 */
export function readEntryFrom(): string | null {
  try {
    return sessionStorage.getItem("bk-current-path");
  } catch {
    return null;
  }
}
