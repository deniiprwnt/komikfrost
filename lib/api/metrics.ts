/**
 * lib/api/metrics.ts - pengukuran ringan (counter + log terstruktur).
 *
 * - MATI secara default di production. Aktifkan dengan env KF_METRICS=1
 *   (di dev otomatis aktif kecuali KF_METRICS=0).
 * - Log dibatasi: maksimal MAX_LOGS_PER_MIN baris per menit per instance;
 *   sisanya hanya masuk counter (dilaporkan di ringkasan).
 * - Hanya angka/label pendek. JANGAN pernah memasukkan cookie, token, header,
 *   atau URL lengkap. Gambar (/api/img) tidak diukur.
 */
const MAX_LOGS_PER_MIN = 30;

function enabled(): boolean {
  const v = process.env.KF_METRICS;
  if (v === "1") return true;
  if (v === "0") return false;
  return process.env.NODE_ENV !== "production";
}

const counters = new Map<string, number>();
let windowStart = 0;
let logged = 0;

/** Tambah counter (murah; tidak mencetak apa pun). */
export function count(name: string, by = 1): void {
  if (!enabled()) return;
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Snapshot counter (untuk /api/health atau pengujian). */
export function metricsSnapshot(): Record<string, number> {
  return Object.fromEntries(counters);
}

export function resetMetrics(): void {
  counters.clear();
  windowStart = 0;
  logged = 0;
}

/** Satu baris log terstruktur, dibatasi lajunya. */
export function logMetric(event: string, fields: Record<string, string | number | boolean | null | undefined>): void {
  if (!enabled()) return;
  count(`log.${event}`);
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    logged = 0;
  }
  if (logged >= MAX_LOGS_PER_MIN) {
    count("log.dropped");
    return;
  }
  logged++;
  console.info(`[kf-metric] ${event} ${JSON.stringify(fields)}`);
}

/** Ukur durasi async; error tetap dilempar ulang. */
export async function timed<T>(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    logMetric(event, { ...fields, ms: Date.now() - t0, ok: true });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.name : "error";
    logMetric(event, { ...fields, ms: Date.now() - t0, ok: false, err: msg });
    throw e;
  }
}
