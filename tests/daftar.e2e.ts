import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { findHref, textVisible, waitForText } from "./helpers";

/**
 * Halaman daftar: kontrol stabil tampil + minimal satu link komik
 * (`/komik/`) muncul setelah data siap. Data live (scraping), jadi
 * timeout dibuat longgar dan polling pakai deadline (helpers.ts),
 * bukan sleep tetap panjang.
 *
 * Khusus /genre: daftar genre sendiri menaut ke /genre/<slug> (bukan
 * /komik/), jadi test membuka genre pertamanya untuk memastikan hasil
 * komik (/komik/) benar-benar tampil.
 */

test("daftar: /terbaru memuat kontrol filter dan daftar komik", async ({ app, screen }) => {
  await app.open("/terbaru");  // Kontrol stabil: judul section + tombol filter "Urutkan daftar"
  // (aria-label dari komponen Select di components/select.tsx).
  await expect(screen.getByText("Komik Terbaru")).toBeVisible({ timeout: 30000 });
  await expect(screen.getByRole("button", "Urutkan daftar")).toBeVisible({ timeout: 15000 });

  const komik = await findHref(screen, "/komik/", 90000);
  if (!komik) {
    const empty = await textVisible(screen, /Tidak ada komik dari sumber data/);
    throw new Error(
      empty
        ? "/terbaru: empty-state eksplisit (0 komik dari sumber data)"
        : "/terbaru: tidak ada link /komik/ dalam 90 dtk (kemungkinan API sumber timeout)",
    );
  }
});

test("daftar: /populer memuat tab periode dan daftar komik", async ({ app, screen }) => {
  await app.open("/populer");
  // Kontrol stabil: judul section + tab periode (link pill).
  await expect(screen.getByText("Peringkat Komik")).toBeVisible({ timeout: 30000 });
  await expect(screen.getByRole("link", "Mingguan")).toBeVisible({ timeout: 15000 });

  const komik = await findHref(screen, "/komik/");
  if (!komik) {
    const empty = await textVisible(screen, /Belum ada data peringkat/);
    throw new Error(
      empty
        ? "/populer: empty-state eksplisit (0 peringkat dari sumber data)"
        : "/populer: tidak ada link /komik/ dalam 60 dtk (kemungkinan API sumber timeout)",
    );
  }
});

test("daftar: /genre memuat daftar genre dan tautan ke komik", async ({ app, screen }) => {
  await app.open("/genre");
  // Kontrol stabil: judul section + kolom saring genre.
  await expect(screen.getByText("Daftar Genre")).toBeVisible({ timeout: 30000 });
  await expect(screen.getByPlaceholder("Ketik nama genre…")).toBeVisible({ timeout: 15000 });

  // Daftar genre menaut ke /genre/<slug>; tunggu data siap via link itu.
  const genre = await findHref(screen, "/genre/");
  if (!genre) {
    const empty =
      (await textVisible(screen, /Belum ada genre dari sumber data/)) ||
      (await textVisible(screen, /tidak ditemukan/));
    throw new Error(
      empty
        ? "/genre: empty-state eksplisit (0 genre dari sumber data)"
        : "/genre: tidak ada link /genre/ dalam 60 dtk (kemungkinan API sumber timeout)",
    );
  }

  // genre pertamanya harus memuat komik (/komik/) setelah data siap.
  await app.open(genre);
  const komik = await findHref(screen, "/komik/");
  if (!komik) {
    const empty = await textVisible(screen, /Tidak ada (komik|hasil)/);
    throw new Error(
      empty
        ? `${genre}: empty-state eksplisit (0 komik untuk genre ini)`
        : `${genre}: tidak ada link /komik/ dalam 60 dtk (kemungkinan API sumber timeout)`,
    );
  }
});

test("daftar: /cari memuat formulir pencarian dan hasil untuk kata kunci", async ({ app, screen, browser }) => {
  await app.open("/cari");
  // Kontrol stabil: form pencarian di `<main>` (header juga punya form
  // pencarian, jadi selektor harus di-scope ke main agar tidak ambigu)
  // + input berlabel.
  const form = browser.locator('main form[role="search"]');
  await expect(form).toBeVisible({ timeout: 30000 });
  await expect(form.getByLabel("Cari judul komik")).toBeVisible({ timeout: 15000 });

  // Query lewat URL (?q=) — bukan duplikasi alur ketik di main-flow.
  await app.open("/cari?q=solo%20leveling");
  await expect(screen.getByText(/Hasil untuk/i)).toBeVisible({ timeout: 30000 });

  const komik = await findHref(screen, "/komik/");
  if (!komik) {
    const empty = await waitForText(screen, /Tidak ada hasil untuk/i, 5000);
    throw new Error(
      empty
        ? '/cari?q=solo leveling: empty-state (0 hasil dari sumber data)'
        : "/cari?q=solo leveling: tidak ada hasil dalam 60 dtk (kemungkinan API sumber timeout)",
    );
  }
});
