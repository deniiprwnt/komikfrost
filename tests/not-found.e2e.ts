import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { waitForText } from "./helpers";

/**
 * 404: penanganan halaman tidak ditemukan.
 *
 * Catatan perilaku app: `/komik/<slug>` cocok dengan route dinamis
 * `app/komik/[slug]` sehingga slug fiktif tampil sebagai state error
 * data ("Gagal memuat data" dari components/states.tsx, karena API
 * mengembalikan 404) — bukan halaman not-found global. Not-found
 * global (app/not-found.tsx) tampil saat path tidak cocok route mana
 * pun. Test ini memeriksa keduanya.
 */
test("404: slug tidak ada dan path tanpa route menampilkan halaman tidak ketemu", async ({ app, screen }) => {
  // Slug fiktif: data 404 → state "Gagal memuat data" (polling — data
  // live butuh waktu sampai semua sumber mengembalikan 404).
  await app.open("/komik/slug-yang-tidak-ada-xyz");
  const dataNotFound = await waitForText(screen, /Gagal memuat data/i, 90000);
  if (!dataNotFound) {
    throw new Error("/komik/slug-yang-tidak-ada-xyz: state tidak-ditemukan tidak tampil dalam 90 dtk");
  }
  // Bukan crash: error boundary global tidak boleh tampil.
  const crashed = await screen.getByText(/Halaman gagal dimuat/i).count();
  if (crashed > 0) throw new Error("/komik/slug-yang-tidak-ada-xyz: error boundary global tampil");

  // Path yang benar-benar tidak cocok route mana pun → not-found.tsx.
  await app.open("/route-yang-tidak-ada-xyz-404");
  await expect(screen.getByText("Halaman tidak ketemu")).toBeVisible({ timeout: 30000 });
  await expect(screen.getByRole("link", "Kembali ke beranda")).toBeVisible({ timeout: 15000 });
});
