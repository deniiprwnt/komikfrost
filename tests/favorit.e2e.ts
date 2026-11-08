import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { collectHrefs, findHref } from "./helpers";

/**
 * Favorit (disimpan di localStorage, kunci `bk-bookmarks-v1` di
 * lib/bookmarks.ts):
 * beranda → detail komik → tombol "Simpan ke favorit" → /favorit
 * memuat komik itu → tombol hapus → komik hilang.
 *
 * Slug diambil dari href asli yang dirender beranda (bukan hardcode)
 * agar tahan terhadap perubahan data live.
 */
test("favorit: simpan dari detail, muncul di /favorit, lalu hapus", async ({ app, screen, browser }) => {
  // localStorage favorit bersih dari awal: tutup tombol favorit yang
  // mungkin tersisa dari run sebelumnya, baca persis seperti halaman
  // Favorit membacanya (kunci `bk-bookmarks-v1`).
  await app.open("/");
  await browser.evaluate("localStorage.removeItem('bk-bookmarks-v1')");

  const komik = await findHref(screen, "/komik/", 90000);
  if (!komik) throw new Error("Beranda: tidak ada link /komik/ untuk diuji favorit");

  // Detail komik: tombol favorit ber-aria-label "Simpan ke favorit"
  // (app/komik/[slug]/page.tsx, di samping judul).
  await app.open(komik);
  const save = screen.getByRole("button", "Simpan ke favorit");
  await expect(save).toBeVisible({ timeout: 60000 });
  await save.click();
  // Konfirmasi tersimpan: label tombol berbalik menjadi "Hapus dari favorit".
  await expect(screen.getByRole("button", "Hapus dari favorit")).toBeVisible({ timeout: 15000 });

  // Daftar favorit harus memuat komik yang baru disimpan.
  await app.open("/favorit");
  const favKomik = await findHref(screen, "/komik/");
  if (favKomik !== komik) {
    throw new Error(
      `/favorit: komik yang disimpan (${komik}) tidak muncul; href pertama: ${favKomik ?? "(tidak ada)"}`,
    );
  }

  // Tombol hapus di kartu favorit (aria-label `Hapus <judul> dari favorit`).
  const remove = screen.getByRole("button", /Hapus .* dari favorit/);
  await expect(remove).toBeVisible({ timeout: 15000 });
  await remove.click();

  // Setelah dihapus: kartu hilang dan empty-state favorit tampil lagi.
  await expect(screen.getByText(/Belum ada favorit/)).toBeVisible({ timeout: 30000 });
  const hrefs = await collectHrefs(screen);
  if (hrefs.includes(komik)) throw new Error("/favorit: komik masih tampil setelah dihapus");
});
