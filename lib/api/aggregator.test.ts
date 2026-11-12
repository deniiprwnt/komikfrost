/**
 * Uji kecil dedupeKey (jalankan: npx tsx lib/api/aggregator.test.ts).
 * Dua judul Sumisaka-san dari sumber berbeda harus satu kunci.
 */
import assert from "node:assert/strict";
import { dedupeKey } from "./aggregator.ts";

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
import { aliasKeys, mergeCards, mergeDetails } from "./aggregator.ts";
import { splitAltTitles } from "./text.ts";
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

/* ---- Audit: dedupe tidak menghilangkan fallback / sourceSlug ---- */
import { dedupeKeys, filterUnseenCards } from "./aggregator.ts";
{
  const seen = new Set<string>();
  const shini = { slug: "uuid-1", title: "Solo Leveling", thumbnail: "https://x/solo.jpg", latestChapter: { label: "Chapter 10", url: "/uuid-1-chapter-10/" } };
  const komikuDup = { slug: "solo-leveling", title: "Solo Leveling", thumbnail: "https://x/solo.jpg", latestChapter: { label: "Chapter 10", url: "/solo-leveling-chapter-10/" } };
  for (const k of dedupeKeys(shini)) seen.add(k);
  const kept = filterUnseenCards([komikuDup as never], seen);
  assert.equal(kept.length, 1, "duplikat harus diteruskan ke mergeCards, bukan dibuang");
  const merged = mergeCards({ shinigami: [shini as never], komiku: [komikuDup as never] });
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sources, ["shinigami", "komiku"]);
  assert.equal(merged[0].sourceSlug.komiku, "solo-leveling");
  assert.equal(merged[0].sourceSlug.shinigami, "uuid-1");
}

/* ---- Audit: prefix saja tidak menggabung judul berbeda ---- */
{
  const a = { slug: "one-piece", title: "One Piece", thumbnail: "https://x/one.jpg", latestChapter: { label: "Chapter 5", url: "/a/" } };
  const b = { slug: "one-piece-x", title: "One Piece X", thumbnail: "https://x/other.jpg", latestChapter: { label: "Chapter 5", url: "/b/" } };
  const merged = mergeCards({ shinigami: [a as never], komiku: [b as never] });
  assert.equal(merged.length, 2, "judul berbeda + sampul berbeda tidak boleh tergabung");
}

/* ---- Audit: metadata pelengkap kartu kalah tetap dipertahankan ---- */
{
  const winner = { slug: "t", title: "T", thumbnail: "https://x/t.jpg", latestChapter: { label: "Chapter 5", url: "/t/" }, thumbnailCandidates: ["https://x/t-alt.jpg"] };
  const loser = { slug: "t2", title: "T", altTitle: "T Alt", thumbnail: "https://x/t2.jpg", latestChapter: { label: "Chapter 5", url: "/t2/" }, thumbnailCandidates: ["https://x/t2-alt.jpg"], synopsis: "Seorang pria mengulang hidupnya untuk ketiga kalinya dan berusaha mengubah takdir yang pernah menghancurkannya." };
  const merged = mergeCards({ shinigami: [winner as never], komiku: [loser as never] });
  assert.equal(merged.length, 1);
  assert.ok((merged[0].thumbnailCandidates ?? []).includes("https://x/t2-alt.jpg"), "kandidat sampul fallback harus dipertahankan");
  assert.equal(merged[0].synopsis, "Seorang pria mengulang hidupnya untuk ketiga kalinya dan berusaha mengubah takdir yang pernah menghancurkannya.");
}
console.log("aggregator.test (audit fallback): OK");
