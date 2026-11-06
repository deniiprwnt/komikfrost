"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registrasi service worker + notifikasi versi baru.
 *
 * - Hanya di production (`next build && next start`). Di dev, aset Next
 *   berubah tiap simpanan sehingga cache SW justru menyajikan bundel basi.
 * - Pendaftaran ditunda sampai window `load` agar tidak berebut bandwidth
 *   dengan render pertama halaman.
 * - SW baru TIDAK auto-aktif: user diberi tombol "Muat ulang" supaya
 *   halaman yang sedang dibaca tidak terputus di tengah jalan.
 */
export function Pwa() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let disposed = false;

    const trackInstalling = (reg: ServiceWorkerRegistration) => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // `controller` ada = sebelumnya sudah ada SW aktif → ini pembaruan,
        // bukan instalasi pertama (instalasi pertama tidak perlu notifikasi).
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(worker);
        }
      });
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (disposed) return;
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting);
        }
        trackInstalling(reg);
        reg.addEventListener("updatefound", () => trackInstalling(reg));
      } catch {
        // SW gagal didaftarkan: situs tetap berjalan normal, hanya tanpa
        // dukungan offline/instalasi. Jangan ganggu user dengan error.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    // Cek pembaruan saat PWA dibuka lagi dari latar belakang.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const worker = waiting;
    if (!worker || reloading.current) return;
    reloading.current = true;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    worker.postMessage("SKIP_WAITING");
    // Pengaman: bila controllerchange tak pernah datang, tetap muat ulang.
    window.setTimeout(() => window.location.reload(), 2000);
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5 shadow-lg md:bottom-6 dark:border-line-dark dark:bg-ink-2"
    >
      <p className="min-w-0 text-[13px] font-semibold leading-snug text-fg dark:text-fg-dark">
        Versi baru KomikFrost siap.
      </p>
      <button
        type="button"
        onClick={applyUpdate}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-accent-strong active:scale-95"
      >
        Muat ulang
      </button>
    </div>
  );
}
