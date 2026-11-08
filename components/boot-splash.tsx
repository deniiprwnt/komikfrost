"use client";

import { useEffect, useState } from "react";
import { syncMeta } from "@/components/theme";
import { BrandMark } from "@/components/brand-mark";

/** Lepas kunci chrome gelap saat splash selesai (lihat theme.tsx). */
function releaseBootLock() {
  document.documentElement.classList.remove("booting");
  syncMeta();
}

/**
 * Splash boot PWA — markup ikut server-render (langsung ada di first paint,
 * semulus splash aplikasi native), visibilitas dikunci via CSS display-mode
 * (hanya PWA terinstal). Hilang via STATE React (jangan pernah node.remove()
 * langsung — node ini milik React, hapus paksa bikin crash saat navigasi).
 * Hilang saat halaman siap (window load) + tampil minimal 900ms, lalu
 * crossfade 650ms. Tidak muncul lagi tiap pindah halaman (hanya full load).
 */
export function BootSplash() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");

  useEffect(() => {
    const mq =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;
    const legacy =
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true || document.referrer.startsWith("android-app://");
    // Bukan PWA: lepas via React agar reconciler tetap konsisten.
    if (!mq && !legacy) {
      document.documentElement.classList.remove("booting");
      setPhase("gone");
      return;
    }
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const started = now();
    const MIN_SHOW = 900;
    const FADE_MS = 750;
    const timers: number[] = [];
    const hide = () => {
      setPhase("hide");
      timers.push(
        window.setTimeout(() => {
          releaseBootLock();
          setPhase("gone");
        }, FADE_MS + 100),
      );
    };
    const hideWhenReady = () => {
      timers.push(
        window.setTimeout(hide, Math.max(0, MIN_SHOW - (now() - started))),
      );
    };
    if (document.readyState === "complete") {
      hideWhenReady();
    } else {
      window.addEventListener("load", hideWhenReady, { once: true });
      // Pengaman: jangan menggantung lebih dari 2,5 dtk bila load macet.
      timers.push(window.setTimeout(hide, 2500));
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("load", hideWhenReady);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className={`boot-splash fixed inset-0 z-[100] flex-col items-center justify-center gap-4 bg-ink ${
        phase === "hide" ? "boot-splash-hide" : ""
      }`}
    >
      <BrandMark className="boot-splash-pop h-20 w-20" />
      <p className="font-display text-2xl font-extrabold tracking-tight text-white">
        Komik<span className="text-accent">Frost</span>
      </p>
    </div>
  );
}
