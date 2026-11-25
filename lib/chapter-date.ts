/**
 * Tanggal rilis chapter — SATU zona waktu untuk server & klien.
 *
 * Dulu tiap sumber memformat tanggal dengan zona waktu mesin (UTC di
 * production, WIB di lokal), sehingga chapter yang rilis 00:30 WIB tampil
 * sehari lebih muda di production. Semua tanggal sekarang dihitung di WIB
 * (pembaca situs), dan label memakai "Hari ini"/"Kemarin" untuk dua hari
 * terakhir.
 */

const TZ = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kunci hari WIB "YYYY-MM-DD". */
function dayKey(ts: number): string {
  const parts = dayFormatter.formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Epoch ms → "24/11/2026" (tanggal WIB). */
export function formatDateId(ts: number): string {
  const [y, m, d] = dayKey(ts).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * "24/11/2026" (tanggal WIB dari sumber) → epoch ms awal hari itu di WIB.
 * Sumber seperti Komiku hanya memberi tanggal tanpa jam.
 */
export function parseDateId(raw?: string | null): number | undefined {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const ts = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) - WIB_OFFSET_MS;
  return Number.isFinite(ts) ? ts : undefined;
}

/** ISO dari sumber → `{ date, dateTs }` yang konsisten (WIB). */
export function chapterDateFromIso(
  iso?: unknown,
): { date: string; dateTs: number } | undefined {
  if (typeof iso !== "string" || !iso.trim()) return undefined;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return undefined;
  return { date: formatDateId(ts), dateTs: ts };
}

/**
 * Label tanggal satu chapter: "Hari ini" / "Kemarin" / "24/11/2026".
 * `fallback` = teks tanggal lama dari API (respons tanpa `dateTs`).
 */
export function chapterDateLabel(
  dateTs?: number,
  fallback?: string,
  now: number = Date.now(),
): string | undefined {
  if (typeof dateTs !== "number" || !Number.isFinite(dateTs)) return fallback;
  const day = dayKey(dateTs);
  if (day === dayKey(now)) return "Hari ini";
  if (day === dayKey(now - 86_400_000)) return "Kemarin";
  return formatDateId(dateTs);
}

/**
 * Label umur rilis chapter berbasis HARI (WIB):
 * hari ini â†’ "5 menit" / "3 jam" (bila sumber memberi jam, bila hanya
 * tanggal â†’ "Hari ini"), kemarin â†’ "Kemarin", lalu "2 hari", "1 minggu",
 * "1 bulan", "1 tahun" (tanpa kata "lalu").
 */
export function chapterAgoLabel(ts: number, now: number = Date.now()): string {
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${dayKey(ts)}T00:00:00Z`)) / 86_400_000,
    ),
  );
  if (days === 0) {
    // Sumber yang hanya memberi tanggal (Komiku) = tepat awal hari WIB.
    if ((ts + WIB_OFFSET_MS) % 86_400_000 === 0) return "Hari ini";
    const mins = Math.max(0, Math.floor((now - ts) / 60_000));
    if (mins < 1) return "baru saja";
    if (mins < 60) return `${mins} menit`;
    return `${Math.floor(mins / 60)} jam`;
  }
  if (days === 1) return "Kemarin";
  if (days < 7) return `${days} hari`;
  if (days < 30) return `${Math.floor(days / 7)} minggu`;
  if (days < 365) return `${Math.floor(days / 30)} bulan`;
  return `${Math.floor(days / 365)} tahun`;
}
