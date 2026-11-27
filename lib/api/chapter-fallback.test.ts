/**
 * Uji sequential fallback chapter. Jalankan: node lib/api/chapter-fallback.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChapterFallback, type ChapterAttempt } from "./chapter-fallback.ts";
import { createKeyedCache } from "./cache.ts";

type Src = "komiku" | "shinigami" | "komikcast";
const chapter = (src: string, n = 2) => ({
  title: `T ${src}`,
  mangaSlug: "x",
  chapterLabel: "Chapter 1",
  images: Array.from({ length: n }, (_, i) => `/api/img?u=${src}${i}`),
  mangaUrl: "/manga/x/",
});

function make(plan: Record<Src, "ok" | "fail" | "empty">) {
  const calls: Src[] = [];
  const attempts: ChapterAttempt[] = (Object.keys(plan) as Src[]).map((source) => ({
    source,
    run: async () => {
      calls.push(source);
      if (plan[source] === "fail") throw new Error(`gagal ${source}`);
      return chapter(source, plan[source] === "empty" ? 0 : 2) as never;
    },
  }));
  return { attempts, calls };
}

// 1. Mahwaindo ada -> Kiryuu & KomikCast TIDAK dipanggil.
{
  const { attempts, calls } = make({ komiku: "ok", shinigami: "ok", komikcast: "ok" });
  const r = await runChapterFallback(attempts);
  assert.deepEqual(calls, ["komiku"]);
  assert.equal(r.source, "komiku");
  assert.equal(r.fallbacks, 0);
}
// 2. Mahwaindo gagal -> Kiryuu dipanggil, KomikCast tidak.
{
  const { attempts, calls } = make({ komiku: "fail", shinigami: "ok", komikcast: "ok" });
  const r = await runChapterFallback(attempts);
  assert.deepEqual(calls, ["komiku", "shinigami"]);
  assert.equal(r.source, "shinigami");
  assert.equal(r.fallbacks, 1);
}
// 3. Mahwaindo kosong (tanpa gambar) -> dianggap tidak ada -> Kiryuu.
{
  const { attempts, calls } = make({ komiku: "empty", shinigami: "ok", komikcast: "ok" });
  const r = await runChapterFallback(attempts);
  assert.deepEqual(calls, ["komiku", "shinigami"]);
  assert.equal(r.data.images.length, 2);
}
// 4. Mahwaindo + Kiryuu gagal -> KomikCast (chapter hanya ada di fallback).
{
  const { attempts, calls } = make({ komiku: "fail", shinigami: "empty", komikcast: "ok" });
  const r = await runChapterFallback(attempts);
  assert.deepEqual(calls, ["komiku", "shinigami", "komikcast"]);
  assert.equal(r.source, "komikcast");
  assert.equal(r.fallbacks, 2);
}
// 5. Ketiganya gagal -> error terakhir dilempar, tidak menggantung.
{
  const { attempts, calls } = make({ komiku: "fail", shinigami: "fail", komikcast: "fail" });
  await assert.rejects(() => runChapterFallback(attempts), /gagal komikcast/);
  assert.equal(calls.length, 3);
}
// 6. Sumber yang sudah gagal di jalur cepat tidak diulang; error sebelumnya terbawa.
{
  await assert.rejects(
    () => runChapterFallback([], new Error("gagal komiku awal")),
    /gagal komiku awal/,
  );
  const { attempts, calls } = make({ komiku: "fail", shinigami: "ok", komikcast: "ok" });
  const r = await runChapterFallback(attempts.filter((a) => a.source !== "komiku"));
  assert.deepEqual(calls, ["shinigami"]);
  assert.equal(r.source, "shinigami");
}
// 7. Cache tidak mencampur identitas komik/chapter/sumber; peek tidak memicu kerja.
{
  const c = createKeyedCache<string>(60_000, 10);
  assert.equal(c.peek("a/1/auto"), null);
  await c.load("a/1/auto", async () => "A1");
  await c.load("b/1/auto", async () => "B1");
  assert.equal(c.peek("a/1/auto"), "A1");
  assert.equal(c.peek("b/1/auto"), "B1");
  assert.equal(c.peek("a/2/auto"), null);
  assert.equal(c.peek("a/1/komiku"), null);
  // Hasil gagal lolos `keep` tidak disimpan.
  await c.load("c/1/auto", async () => "", (v) => v !== "");
  assert.equal(c.peek("c/1/auto"), null);
}

// 8. Detail fast memakai cache deep bila ada (tanpa scrape kedua); deep tidak pernah memakai fast.
{
  const src = readFileSync(new URL("./manga.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!deep\) \{\s*const full = detailCache\.peek\(`deep:\$\{slug\}`\);/);
  assert.doesNotMatch(src, /if \(deep\) \{\s*const [a-z]+ = detailCache\.peek\(`fast:/);
}

console.log("chapter-fallback.test: OK");
