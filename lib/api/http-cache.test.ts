/**
 * Uji ketentuan 1-3 + investigasi komentar Komikcast.
 * Jalankan: node lib/api/http-cache.test.ts
 *
 * Uji ini mengunci PERILAKU yang mudah rusak tanpa sengaja:
 *  - ETag hanya menghemat bandwidth (lemah, cocok untuk 304).
 *  - /api/img dikecualikan di middleware TAPI route-nya tetap wajib guard()
 *    dan cache-nya tetap private.
 *  - Prefetch otomatis menu dihapus; prefetch niat-user tetap ada.
 *  - Polling /terbaru (dan beranda) 60 detik.
 *  - Komikcast tanpa komentar = status empty berpesan, bukan data palsu.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etagMatches, weakEtag } from "./http-cache.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/* ------------------------- ETag: bandwidth saja ------------------------- */
{
  const a = weakEtag("img-v1", "https://cdn/x.jpg");
  assert.equal(a, weakEtag("img-v1", "https://cdn/x.jpg"), "ETag harus stabil");
  assert.notEqual(a, weakEtag("img-v1", "https://cdn/y.jpg"), "URL beda â†’ ETag beda");
  assert.match(a, /^W\/"[0-9a-f]+-[0-9a-f]+"$/, "ETag harus lemah (W/)");

  // Perbandingan lemah: W/ di kedua sisi diabaikan.
  assert.equal(etagMatches(a, a), true);
  assert.equal(etagMatches(a.replace(/^W\//, ""), a), true);
  assert.equal(etagMatches(`"lain", ${a}`, a), true, "daftar If-None-Match");
  assert.equal(etagMatches("*", a), true);
  assert.equal(etagMatches(null, a), false);
  assert.equal(etagMatches("", a), false);
  assert.equal(etagMatches(weakEtag("lain"), a), false);

  // 304 TIDAK boleh memaksa respons publik: cache gambar tetap private.
  const route = read("app/api/img/route.ts");
  assert.match(route, /private, max-age=\$\{IMG_CACHE_SECONDS\}/, "Cache-Control gambar wajib private");
  assert.doesNotMatch(route, /"Cache-Control": `public/, "cache gambar tidak boleh public");
  assert.match(route, /status: 304/, "harus ada jalur 304");
  assert.match(route, /ETag: etag/, "respons 200 wajib membawa ETag");
}

/* ---------- /api/img: dikecualikan middleware, tetap ber-guard ---------- */
{
  const mw = read("middleware.ts");
  const imgRoute = read("app/api/img/route.ts");

  // Pengecualian ada di cabang aset statis (sebelum isAuthed di middleware).
  const exclAt = mw.indexOf('pathname === "/api/img"');
  const authedAt = mw.indexOf("await isAuthed(req)");
  assert.ok(exclAt > 0, "middleware harus mengecualikan /api/img");
  assert.ok(authedAt > 0 && exclAt < authedAt, "pengecualian harus SEBELUM pemeriksaan sesi");

  // â€¦dan itu tidak boleh melemahkan route: guard() wajib ada & tidak boleh
  // dihapus/dimatikan.
  assert.match(imgRoute, /const blocked = await guard\(req,/, "/api/img wajib memanggil guard()");
  assert.match(imgRoute, /if \(blocked\) return blocked;/, "hasil guard wajib dipakai");
  assert.match(
    read("app/api/_lib.ts"),
    /if \(!\(await isAuthed\(req\)\)\)/,
    "guard() wajib memeriksa isAuthed",
  );

  // URUTAN: guard() WAJIB berjalan SEBELUM pemeriksaan ETag/304. Request
  // tanpa sesi harus dijawab 401 walau If-None-Match cocok â€” 304 tidak boleh
  // bocor ke klien tak terautentikasi.
  const guardAt = imgRoute.indexOf("await guard(req,");
  const etagAt = imgRoute.indexOf("etagMatches(");
  assert.ok(guardAt > 0, "guard() harus dipanggil di route /api/img");
  assert.ok(etagAt > 0, "pemeriksaan ETag harus ada di route /api/img");
  assert.ok(guardAt < etagAt, "guard() harus dijalankan SEBELUM pemeriksaan ETag/304");
}

/* ---------------- Prefetch: otomatis hilang, niat user tetap ---------------- */
{
  const nav = read("lib/nav-prefetch.ts");
  assert.match(nav, /export function warmRoute/, "warmRoute (hover/fokus/sentuh) dipertahankan");
  assert.doesNotMatch(nav, /export function warmPrimaryNav/, "prefetch otomatis harus dihapus");
  const layout = read("components/layout.tsx");
  // Tidak boleh ada impor/pemanggilan prefetch otomatis (komentar boleh
  // menyebut namanya untuk menjelaskan penghapusan).
  assert.doesNotMatch(layout, /import[^;]*nav-prefetch/, "layout tidak boleh impor prefetch menu");
  assert.doesNotMatch(layout, /warmPrimaryNav\s*\(/, "layout tidak boleh memanggil prefetch otomatis");
  assert.doesNotMatch(layout, /Panaskan data menu lain/, "komentar prefetch otomatis harus ikut hilang");

  const link = read("components/nav-link.tsx");
  assert.match(link, /prefetch = false/, "prefetch Next otomatis dimatikan");
  for (const h of ["onMouseEnter", "onFocus", "onTouchStart", "onPointerDown"]) {
    assert.ok(link.includes(`${h}={`), `${h} tetap memanaskan (niat user)`);
  }
  assert.match(link, /warmRoute\(path\)/, "handler niat user wajib memanggil warmRoute");
}

/* --------------------- Polling 60 dtk + cache 15-30 dtk --------------------- */
{
  assert.match(read("app/terbaru/page.tsx"), /useAutoRefresh\(silentCheck, 120_000\)/, "/terbaru poll 2 menit");
  assert.match(read("app/page.tsx"), /useAutoRefresh\(checkNewAll, 120_000\)/, "beranda poll 2 menit");

  const manga = read("lib/api/manga.ts");
  // Cache 15-30 dtk tidak boleh menghalangi deteksi update: probe live bypass.
  assert.match(manga, /const latestCache = createKeyedCache<PagedResult<MangaCard>>\(120_000, 50\)/);
  const liveBlock = manga.slice(manga.indexOf("if (opts.live)"), manga.indexOf("return latestCache.load"));
  assert.ok(liveBlock.includes("liveInflight") && !liveBlock.includes("latestCache.load"), "probe live tidak memakai cache TTL");
  // Sumber tetap membuang cache HTTP upstream saat probe.
  assert.match(read("lib/api/komiku.ts"), /if \(fresh\) init\.cache = "no-store"/);
  assert.match(read("lib/api/komikcast.ts"), /if \(fresh\) init\.cache = "no-store"/);
  assert.match(read("lib/api/shinigami.ts"), /else init\.next = \{ revalidate \}/, "shinigami: revalidate hanya untuk non-fresh");
}

/* ------------- Komikcast: komentar jujur, bukan data palsu ------------- */
{
  const c = read("lib/api/comments.ts");
  const idx = c.indexOf('komikcast: async ()');
  assert.ok(idx > 0, "adapter komikcast harus ada");
  const block = c.slice(idx, idx + 400);
  assert.match(block, /none\("komikcast", "Komikcast tidak menyediakan komentar\."\)/);
  assert.doesNotMatch(block, /items: \[\{/, "tidak boleh mengarang komentar");
  // Urutan sumber tidak berubah: Shinigami â†’ Komiku â†’ Komikcast.
  assert.match(read("lib/api/aggregator.ts"), /\["shinigami", "komiku", "komikcast"\]/);
}

console.log("http-cache.test: OK");
