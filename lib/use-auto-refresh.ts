"use client";

import { useEffect, useRef } from "react";
import { createRefreshGate } from "./refresh-gate";

const CHANNEL_NAME = "kf-auto-refresh";
/** Pemicu foreground/online/pageshow yang datang < 20 dtk setelah refresh terakhir diabaikan. */
const EVENT_COOLDOWN_MS = 20_000;

/**
 * Refresh otomatis daftar saat ada komik baru — tanpa reload manual
 * (penting di PWA yang tidak punya tombol reload).
 * - Polling tiap `intervalMs` (default 2 menit) hanya saat tab terlihat.
 * - Refresh langsung saat PWA kembali ke foreground (visibility/focus),
 *   saat online kembali, dan saat pageshow (back-forward cache).
 * - Pemicu yang menyala bersamaan (visibility + focus + pageshow) digabung
 *   lewat cooldown, dan tab lain di halaman yang sama ikut menahan lewat
 *   BroadcastChannel (tanpa BroadcastChannel = hanya cooldown per tab).
 * - Callback wajib silent: sukses → update diam-diam, gagal → abaikan
 *   (tidak mengutak-atik error/loading yang sedang tampil).
 */
export function useAutoRefresh(cb: () => void, intervalMs = 120_000) {
  // Floor 120 dtk: jangan dipercepat — tiap probe = 1 Function Invocation +
  // kerja scrape/merge di server.
  intervalMs = Math.max(intervalMs, 120_000);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const gate = createRefreshGate({ eventCooldownMs: EVENT_COOLDOWN_MS, intervalMs });
    // Halaman baru saja memuat datanya sendiri: pageshow awal tidak perlu probe ulang.
    gate.mark();
    // Kunci per halaman+filter: tab /terbaru berbeda filter tidak saling menahan.
    const currentKey = () => window.location.pathname + window.location.search;
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (e: MessageEvent) => {
          if (e.data && e.data.key === currentKey()) gate.mark();
        };
      }
    } catch {
      channel = null; // tidak didukung: cukup cooldown per tab
    }
    const visible = () => document.visibilityState === "visible";
    const run = (kind: "interval" | "event") => {
      if (!visible()) return;
      if (!gate.allow(kind)) return;
      gate.mark();
      try {
        channel?.postMessage({ key: currentKey() });
      } catch {
        // abaikan
      }
      try {
        cbRef.current();
      } catch {
        // Refresh background boleh gagal diam-diam.
      }
    };
    const onInterval = () => run("interval");
    const onEvent = () => run("event");
    const onVisibility = () => {
      if (visible()) run("event");
    };
    const timer = window.setInterval(onInterval, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onEvent);
    window.addEventListener("online", onEvent);
    window.addEventListener("pageshow", onEvent);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onEvent);
      window.removeEventListener("online", onEvent);
      window.removeEventListener("pageshow", onEvent);
      try {
        channel?.close();
      } catch {
        // abaikan
      }
    };
  }, [intervalMs]);
}
