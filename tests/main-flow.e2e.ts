import { test } from "@e2e-dev/web";
import { expect } from "e2e";

/**
 * Alur utama KomikFrost:
 * beranda → cari "solo leveling" → detail komik → buka chapter → reader.
 *
 * Data live dari sumber scraping (Shinigami primer, Komiku/Komikcast
 * fallback),
 * jadi timeout dibuat longgar. Test menavigasi pakai href asli yang
 * dirender (bukan slug hardcode) agar tahan terhadap perubahan data.
 */
test("alur utama: beranda → cari → detail → reader", async ({ app, screen, browser }) => {
  // 1. Beranda terbuka: brand + daftar komik tampil.
  await app.open("/");
  // aria-label logo di components/layout.tsx: "KomikFrost, ke beranda".
  await expect(screen.getByRole("link", "KomikFrost, ke beranda")).toBeVisible({ timeout: 30000 });

  // Tunggu daftar beranda selesai load: route-memory menunda render
  // konten pertama, jadi tunggu sampai ada kartu komik yang terpasang.
  await screen.getByRole("link").first().waitFor({ state: "attached", timeout: 60000 });
  const homeHrefs: (string | null)[] = [];
  let homeKomik: string | undefined;
  const homeDeadline = Date.now() + 60000;
  while (Date.now() < homeDeadline && !homeKomik) {
    homeHrefs.length = 0;
    for (const link of await screen.getByRole("link").all()) {
      homeHrefs.push(await link.getAttribute("href"));
    }
    homeKomik = homeHrefs.find(
      (h): h is string => typeof h === "string" && h.startsWith("/komik/"),
    );
    if (!homeKomik) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!homeKomik) throw new Error("Beranda: tidak ada link /komik/ yang dirender");

  // 2. Cari "solo leveling" lewat form pencarian halaman /cari.
  await app.open("/cari");
  // Form /cari di `<main>` (header juga punya form pencarian ber-role
  // search — selektor di-scope ke main agar tidak ambigu).
  const form = browser.locator('main form[role="search"]');
  const input = form.getByLabel("Cari judul komik");
  await input.fill("solo leveling");
  // Baca nilai DOM langsung (state React settle async, tapi value input
  // sudah sinkron) — pastikan submit tidak lolos dengan query kosong.
  const typed = await input.inputValue();
  if (typed !== "solo leveling") throw new Error(`Input cari berisi "${typed}", bukan "solo leveling"`);
  // Form /cari tidak punya tombol submit — Enter di input adalah alur
  // user yang sah (submit handler form).
  await input.press("Enter");
  await expect(screen.getByText(/Hasil untuk/i)).toBeVisible({ timeout: 15000 });

  // Tunggu hasil (atau empty-state yang eksplisit — bukan loading selamanya).
  const resultLinks: (string | null)[] = [];
  let found: string | undefined;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !found) {
    resultLinks.length = 0;
    for (const link of await screen.getByRole("link").all()) {
      resultLinks.push(await link.getAttribute("href"));
    }
    found = resultLinks.find(
      (h): h is string => typeof h === "string" && h.startsWith("/komik/"),
    );
    if (!found) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!found) {
    const empty = await screen.getByText(/Tidak ada hasil untuk/i).isVisible();
    throw new Error(
      empty
        ? 'Pencarian "solo leveling": empty-state (0 hasil dari sumber data)'
        : 'Pencarian "solo leveling": tidak ada hasil dalam 60 dtk (kemungkinan API sumber timeout)',
    );
  }

  // 3. Detail komik: judul + daftar chapter tampil.
  await app.open(found);
  await expect(browser).toHaveURL(/\/komik\//, { timeout: 30000 });
  await expect(screen.getByText(/Daftar Chapter/i)).toBeVisible({ timeout: 60000 });

  const chapterHrefs: (string | null)[] = [];
  for (const link of await screen.getByRole("link").all()) {
    chapterHrefs.push(await link.getAttribute("href"));
  }
  const chapter = chapterHrefs.find(
    (h): h is string => typeof h === "string" && h.startsWith("/baca/"),
  );
  if (!chapter) throw new Error("Detail: tidak ada link /baca/ (daftar chapter kosong)");

  // 4. Reader: gambar halaman chapter tampil.
  await app.open(chapter);
  await expect(browser).toHaveURL(/\/baca\//, { timeout: 30000 });
  const firstPage = screen.getByRole("img", /halaman 1/).first();
  await expect(firstPage).toBeVisible({ timeout: 90000 });
  const pageCount = await screen.getByRole("img", /halaman/).count();
  if (pageCount < 1) throw new Error("Reader: tidak ada gambar halaman yang dirender");
});
