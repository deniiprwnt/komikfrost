/**
 * Helper bersama untuk test e2e (bukan file test: tanpa `test(...)`).
 *
 * Pola polling dengan deadline — sama seperti tests/main-flow.e2e.ts —
 * untuk data live dari sumber scraping: tidak ada sleep tetap panjang,
 * ulang baca sampai kondisi terpenuhi atau deadline habis.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScreen = any;

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_INTERVAL_MS = 2000;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Baca semua href link yang sedang ter-render di halaman. */
export async function collectHrefs(screen: AnyScreen): Promise<(string | null)[]> {
  const hrefs: (string | null)[] = [];
  for (const link of await screen.getByRole("link").all()) {
    hrefs.push(await link.getAttribute("href"));
  }
  return hrefs;
}

/**
 * Tunggu sampai ada link dengan href berawalan `prefix`; polling tiap
 * `intervalMs` sampai `timeoutMs` habis. Mengembalikan href-nya, atau
 * `undefined` bila deadline habis (biarkan pemanggil memutuskan error
 * yang bermakna, mis. empty-state vs timeout API).
 */
export async function findHref(
  screen: AnyScreen,
  prefix: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let found: string | undefined;
  while (Date.now() < deadline && !found) {
    const hrefs = await collectHrefs(screen);
    found = hrefs.find(
      (h): h is string => typeof h === "string" && h.startsWith(prefix),
    );
    if (!found) await sleep(intervalMs);
  }
  return found;
}

/** Apakah ada teks yang cocok `pattern` dan sedang terlihat (tanpa menunggu). */
export async function textVisible(
  screen: AnyScreen,
  pattern: RegExp,
): Promise<boolean> {
  try {
    return await screen.getByText(pattern).isVisible();
  } catch {
    return false;
  }
}

/**
 * Tunggu sampai teks yang cocok `pattern` terlihat, atau deadline habis.
 * Mengembalikan `true` bila teks muncul sebelum deadline — dipakai untuk
 * menandai empty-state eksplisit agar pesan error test informatif.
 */
export async function waitForText(
  screen: AnyScreen,
  pattern: RegExp,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await textVisible(screen, pattern)) return true;
    await sleep(intervalMs);
  }
  return false;
}
