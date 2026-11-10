/**
 * Uji kecil dedupeKey (jalankan: npx tsx lib/api/aggregator.test.ts).
 * Dua judul Sumisaka-san dari sumber berbeda harus satu kunci.
 */
import assert from "node:assert/strict";
import { dedupeKey } from "./aggregator";

const KEY = "sumisaka san wild delusions";
const a = dedupeKey("Sumisaka-san's Mousouchu");
const b = dedupeKey("Sumisaka-san's Wild Delusions");
const c = dedupeKey("Sumisaka-san Mousou Chu");
assert.equal(a, KEY);
assert.equal(b, KEY);
assert.equal(c, KEY);
assert.equal(dedupeKey("Sumisaka-san (1-5)"), "sumisaka san");
// Alias hanya mengganti ekor — judul lain tak terpengaruh.
assert.equal(dedupeKey("Mousouchu Academy"), "mousouchu academy");
assert.equal(dedupeKey("Frieren's Journey"), "frieren journey");
console.log("aggregator.test: OK");

/* ---- Sumisaka-san: dua judul → SATU kartu, chapter terbanyak (Ch 5) ---- */
import { aliasKeys, mergeCards, mergeDetails } from "./aggregator";
import { splitAltTitles } from "./text";
{
  const mk = (title: string, n: number) => ({
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    title,
    thumbnail: "",
    latestChapter: { label: `Chapter ${n}`, url: `/x-chapter-${n}/` },
  });
  const merged = mergeCards({
    komiku: [mk("Sumisaka-san's Mousouchu", 5)],
    komikcast: [mk("Sumisaka-san's Wild Delusions", 3)],
  } as never);
  assert.equal(merged.length, 1, "Sumisaka-san harus 1 judul");
  assert.equal(merged[0].latestChapter?.label, "Chapter 5");
}

/* ---- Money Keeps Piling Up: Comedy masuk chip, label utama tetap Drama ---- */
{
  const g = (...n: string[]) => n.map((x) => ({ name: x, slug: x.toLowerCase().replace(/\s+/g, "-") }));
  const base = { cover: "", synopsis: "", chapters: [] };
  const d = mergeDetails({
    shinigami: { ...base, slug: "uuid", title: "Money Keeps Piling Up", genres: g("Drama", "Fantasy") },
    komiku: { ...base, slug: "money-id", title: "Money Keeps Piling Up", genres: g("Drama", "Slice of Life", "Comedy"), theme: "Action" },
    komikcast: { ...base, slug: "money", title: "Money Keeps Piling Up", genres: g("Adventure") },
  } as never)!;
  assert.deepEqual(d.genres.map((x) => x.name), ["Drama", "Fantasy", "Slice of Life", "Comedy"]);
  assert.equal(d.genres[0].name, "Drama");
  assert.ok(!d.genres.some((x) => x.name === "Action"), "theme tidak boleh jadi genre");
}

/* ---- Rewriting My Third Life: alias majemuk harus saling cocok ---- */
{
  assert.deepEqual(splitAltTitles("Rewriting My Third Life; Third Life Again"), [
    "Rewriting My Third Life; Third Life Again", "Rewriting My Third Life", "Third Life Again",
  ]);
  const want = aliasKeys("rewriting-my-third-life-id");
  const have = aliasKeys("Judul Lain", "Third Life Redo | Rewriting My Third Life");
  assert.ok(have.some((k) => want.includes(k)), "alias majemuk harus beririsan");
  // Sinopsis: sumber terbaik dipilih lintas sumber; semua kosong → "".
  const base = { cover: "", chapters: [], genres: [] };
  const syn = "Seorang pria mengulang hidupnya untuk ketiga kalinya dan berusaha mengubah takdir yang pernah menghancurkannya.";
  const withSyn = mergeDetails({
    shinigami: { ...base, slug: "u", title: "Rewriting My Third Life", synopsis: "" },
    komikcast: { ...base, slug: "r", title: "Rewriting My Third Life", synopsis: syn },
  } as never)!;
  assert.equal(withSyn.synopsis, syn);
  const none = mergeDetails({ komiku: { ...base, slug: "r", title: "Rewriting My Third Life", synopsis: "" } } as never)!;
  assert.equal(none.synopsis, "");
}
console.log("aggregator.test (merge/alias): OK");

/* ---- Comedy hanya di Tema sumber pemenang → chip terakhir (maks 1) ---- */
{
  const g = (...n: string[]) => n.map((x) => ({ name: x, slug: x.toLowerCase().replace(/\s+/g, "-") }));
  const base = { cover: "", synopsis: "", chapters: [] };
  const d = mergeDetails({
    komiku: { ...base, slug: "m-id", title: "Money Keeps Piling Up", genres: g("Drama", "Fantasy", "Slice of Life"), theme: "Comedy" },
  } as never)!;
  assert.deepEqual(d.genres.map((x) => x.name), ["Drama", "Fantasy", "Slice of Life", "Comedy"]);
  // Tema tak dikenal / tema sumber non-pemenang tidak ikut.
  const e = mergeDetails({
    shinigami: { ...base, slug: "u", title: "X", genres: g("Drama") },
    komiku: { ...base, slug: "x-id", title: "X", genres: g("Drama"), theme: "Comedy" },
  } as never)!;
  assert.deepEqual(e.genres.map((x) => x.name), ["Drama"]);
}
console.log("aggregator.test (theme fallback): OK");
