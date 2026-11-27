/**
 * lib/refresh-gate.ts — cooldown/dedupe murni untuk auto-refresh (tanpa DOM,
 * agar bisa diuji di Node).
 *
 * Masalah: visibilitychange + focus + pageshow + online sering menyala hampir
 * bersamaan saat PWA kembali ke foreground, sehingga satu kejadian memicu 2-3
 * probe ke server. Gate ini menolak pemicu yang datang terlalu dekat dengan
 * refresh terakhir (di tab ini maupun di tab lain lewat mark()).
 *
 * - Pemicu "event" (foreground/online/pageshow): ditolak bila < eventCooldownMs
 *   sejak refresh terakhir.
 * - Pemicu "interval": ditolak bila < setengah interval sejak refresh terakhir
 *   (mis. baru saja refresh karena event atau karena tab lain).
 * Gate hanya MENGURANGI refresh; interval polling tidak pernah dipercepat.
 */
export type RefreshTrigger = "interval" | "event";

export interface RefreshGate {
  allow(kind: RefreshTrigger, now?: number): boolean;
  /** Catat bahwa refresh baru saja terjadi (di tab ini atau tab lain). */
  mark(now?: number): void;
}

export function createRefreshGate(opts: { eventCooldownMs: number; intervalMs: number }): RefreshGate {
  let last = 0;
  return {
    allow(kind, now = Date.now()) {
      const min = kind === "event" ? opts.eventCooldownMs : opts.intervalMs / 2;
      return now - last >= min;
    },
    mark(now = Date.now()) {
      last = now;
    },
  };
}
