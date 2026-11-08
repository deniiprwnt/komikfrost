import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { findHref } from "./helpers";

/**
 * Reader: pemeriksaan ringan pada halaman reader yang dibuka —
 * semua gambar halaman punya `alt` tidak kosong (minimal gambar
 * pertama) dan tidak ada error boundary ("Terjadi kesalahan" dsb).
 *
 * Urutan: beranda → detail → chapter → reader (href asli yang
 * dirender, bukan slug hardcode). Tidak menduplikasi main-flow:
 * di sini yang diperiksa adalah properti gambar + absennya error.
 */
test("reader: gambar halaman ber-alt dan tanpa error boundary", async ({ app, screen, browser }) => {
  await app.open("/");
  const komik = await findHref(screen, "/komik/", 90000);
  if (!komik) throw new Error("Beranda: tidak ada link /komik/ untuk membuka reader");

  await app.open(komik);
  await expect(screen.getByText(/Daftar Chapter/i)).toBeVisible({ timeout: 60000 });
  const chapter = await findHref(screen, "/baca/");
  if (!chapter) throw new Error("Detail: tidak ada link /baca/ (daftar chapter kosong)");

  await app.open(chapter);
  await expect(browser).toHaveURL(/\/baca\//, { timeout: 30000 });

  // Gambar halaman pertama wajib terlihat (alt pola "`<judul> halaman 1`").
  await expect(screen.getByRole("img", /halaman 1/).first()).toBeVisible({ timeout: 90000 });

  // Semua gambar halaman: alt tidak kosong.
  const pageImages = await screen.getByRole("img", /halaman/).all();
  if (pageImages.length < 1) throw new Error("Reader: tidak ada gambar halaman yang dirender");
  for (let i = 0; i < pageImages.length; i += 1) {
    const alt = await pageImages[i].getAttribute("alt");
    if (!alt || alt.trim().length === 0) {
      throw new Error(`Reader: gambar halaman ke-${i + 1} punya alt kosong`);
    }
  }

  // Tidak ada error boundary global ("Halaman gagal dimuat" di
  // app/error.tsx) atau state error data ("Gagal memuat data").
  const errors = await screen.getByText(/Terjadi kesalahan|Halaman gagal dimuat|Gagal memuat data/i).count();
  if (errors > 0) throw new Error("Reader: error boundary tampil di halaman reader");
});
