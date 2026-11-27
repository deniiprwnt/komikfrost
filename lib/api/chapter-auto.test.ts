/**
 * Uji integrasi getChapter -> getChapterAuto -> getChapterMerged (logika skip).
 * Jalankan: node lib/api/chapter-auto.test.ts
 *
 * Yang dipalsukan HANYA batas jaringan (komiku, manhwaindo, komikcast,
 * shinigami, manga) lewat module hook. chapter.ts, aggregator, cache, dan
 * orkestrator fallback adalah kode asli.
 */
import assert from "node:assert/strict";
import { register } from "node:module";

process.env.KF_METRICS = "0";

const SOURCES: Record<string, string> = {
  komiku: `export class KomikuError extends Error { constructor(m, s) { super(m); this.source = s; } }`,
  manhwaindo: `export const fetchChapter = (u, o) => globalThis.__kf.komiku(u, o);`,
  komikcast: `export const fetchKomikcastChapter = (u) => globalThis.__kf.komikcast(u);`,
  shinigami: `
export const fetchShiniChapter = (id, n, s, t) => globalThis.__kf.kiryuuNum(id, n);
export const fetchShiniChapterById = (cid, s, t) => globalThis.__kf.kiryuuId(cid);
export const isShiniId = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
export const parseNumToken = (t) => Number(String(t).replace("-", "."));
export const resolveShiniDetailForSlug = () => null;`,
  manga: `
export const getMangaDetail = (s, o) => globalThis.__kf.detail(s, o);
export const peekMangaDetail = (s) => globalThis.__kf.peek(s);`,
};

const hooks = `
const SOURCES = ${JSON.stringify(SOURCES)};
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || "";
  if (specifier.startsWith("./") && !specifier.slice(2).includes(".") && parent.includes("/lib/api/")) {
    const name = specifier.slice(2);
    if (parent.endsWith("/chapter.ts") && SOURCES[name]) {
      return { url: "kf-mock:" + name, shortCircuit: true };
    }
    return nextResolve(specifier + ".ts", context);
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith("kf-mock:")) {
    return { format: "module", source: SOURCES[url.slice(8)], shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register("data:text/javascript," + encodeURIComponent(hooks));

interface Cfg {
  detail: unknown;
  peek?: boolean;
  komiku: (url: string) => boolean;
  kiryuu: boolean;
  komikcast: boolean;
}
const log: string[] = [];
let cfg: Cfg;

const ch = (src: string) => ({
  title: `T ${src}`,
  mangaSlug: "x",
  chapterLabel: "Chapter 5",
  images: [`/img/${src}`],
  mangaUrl: "/manga/x/",
  // Sengaja "bocor": harus ditimpa navigasi gabungan.
  prevUrl: "/raw-prev/",
  nextUrl: "/raw-next/",
});

(globalThis as unknown as { __kf: unknown }).__kf = {
  komiku: async (url: string) => {
    log.push(`komiku:${url}`);
    if (!cfg.komiku(url)) throw new Error(`komiku gagal ${url}`);
    return ch("komiku");
  },
  komikcast: async (url: string) => {
    log.push(`komikcast:${url}`);
    if (!cfg.komikcast) throw new Error("komikcast gagal");
    return ch("komikcast");
  },
  kiryuuId: async (cid: string) => {
    log.push(`kiryuu-id:${cid}`);
    if (!cfg.kiryuu) throw new Error("kiryuu gagal");
    return ch("kiryuu");
  },
  kiryuuNum: async (_id: string, n: number) => {
    log.push(`kiryuu-num:${n}`);
    if (!cfg.kiryuu) throw new Error("kiryuu gagal");
    return ch("kiryuu");
  },
  detail: async () => {
    log.push("detail");
    return cfg.detail;
  },
  peek: () => (cfg.peek ? cfg.detail : null),
};

const { getChapter } = await import("./chapter.ts");

type Src = { source: string; url: string; chapterId?: string };
/** Daftar chapter terbaru dulu: 6, 5, 4. `list5` = sumber chapter 5 (null = tidak ada di daftar). */
function detailOf(slug: string, list5: Src[] | null) {
  const chapters = [
    { title: "Chapter 6", url: "/n6", sources: [{ source: "komiku", url: `/${slug}-chapter-6/` }] },
    ...(list5 ? [{ title: "Chapter 5", url: "/n5", sources: list5 }] : []),
    { title: "Chapter 4", url: "/n4", sources: [{ source: "komiku", url: `/${slug}-chapter-4/` }] },
  ];
  return { slug, title: "T", sourceSlug: { shinigami: "11111111-2222-3333-4444-555555555555" }, chapters };
}

async function run(slug: string, c: Cfg) {
  log.length = 0;
  cfg = c;
  const data = await getChapter(slug, "5");
  return { data, calls: [...log] };
}
const KIRYUU: Src = { source: "shinigami", url: "/k/5", chapterId: "cid5" };

// 1. URL tebakan SAMA dengan entrySources: Mahwaindo tidak diminta ulang;
//    Kiryuu menang, KomikCast tidak dipanggil; identitas & navigasi terjaga.
{
  const slug = "slug-a";
  const guess = `/${slug}-chapter-5/`;
  const detail = detailOf(slug, [
    { source: "komiku", url: guess },
    KIRYUU,
    { source: "komikcast", url: "/kc/5/" },
  ]);
  const before = JSON.stringify(detail.chapters);
  const { data, calls } = await run(slug, {
    detail,
    komiku: () => false,
    kiryuu: true,
    komikcast: true,
  });
  assert.deepEqual(calls, [`komiku:${guess}`, "detail", "kiryuu-id:cid5"]);
  assert.equal(data.source, "shinigami");
  assert.equal(data.images[0], "/img/kiryuu");
  assert.equal(data.nextUrl, "/n6"); // lebih baru
  assert.equal(data.prevUrl, "/n4"); // lebih lama
  assert.equal(JSON.stringify(detail.chapters), before, "daftar chapter/sources tidak berubah");
}

// 2. Perbedaan garis miring akhir dianggap URL yang sama -> tetap di-skip.
{
  const slug = "slug-f";
  const guess = `/${slug}-chapter-5/`;
  const { calls } = await run(slug, {
    detail: detailOf(slug, [{ source: "komiku", url: `/${slug}-chapter-5` }, KIRYUU]),
    komiku: () => false,
    kiryuu: true,
    komikcast: true,
  });
  assert.deepEqual(calls, [`komiku:${guess}`, "detail", "kiryuu-id:cid5"]);
}

// 3. URL tebakan BEDA: Mahwaindo tetap dicoba dengan URL yang benar; sumber lain tidak dipanggil.
{
  const slug = "slug-b";
  const guess = `/${slug}-chapter-5/`;
  const real = `/${slug}-judul-asli-chapter-5/`;
  const { data, calls } = await run(slug, {
    detail: detailOf(slug, [{ source: "komiku", url: real }, KIRYUU, { source: "komikcast", url: "/kc/5/" }]),
    komiku: (u) => u === real,
    kiryuu: true,
    komikcast: true,
  });
  assert.deepEqual(calls, [`komiku:${guess}`, "detail", `komiku:${real}`]);
  assert.equal(data.source, "komiku");
  assert.equal(data.nextUrl, "/n6");
  assert.equal(data.prevUrl, "/n4");
}

// 4. URL Mahwaindo tidak ada di daftar chapter: fallback Kiryuu -> KomikCast tetap jalan.
{
  const slug = "slug-c";
  const guess = `/${slug}-chapter-5/`;
  const kcUrl = "/kc/5/";
  const { data, calls } = await run(slug, {
    detail: detailOf(slug, [KIRYUU, { source: "komikcast", url: kcUrl }]),
    komiku: () => false,
    kiryuu: false,
    komikcast: true,
  });
  assert.deepEqual(calls, [`komiku:${guess}`, "detail", "kiryuu-id:cid5", `komikcast:${kcUrl}`]);
  assert.equal(data.source, "komikcast");
  assert.equal(data.nextUrl, "/n6");
  assert.equal(data.prevUrl, "/n4");
}

// 5. Chapter belum ada di daftar gabungan (URL belum diketahui): Mahwaindo TIDAK di-skip,
//    lalu Kiryuu (via nomor) dan KomikCast tetap dicoba berurutan.
{
  const slug = "slug-d2";
  const guess = `/${slug}-chapter-5/`;
  const { data, calls } = await run(slug, {
    detail: detailOf(slug, null),
    komiku: () => false,
    kiryuu: false,
    komikcast: true,
  });
  assert.deepEqual(calls, [
    `komiku:${guess}`,
    "detail",
    `komiku:${guess}`,
    "kiryuu-num:5",
    `komikcast:/${slug}-chapter-5-bahasa-indonesia/`,
  ]);
  assert.equal(data.source, "komikcast");
}

// 6. Jalur cepat berhasil: tidak ada scrape detail, tidak ada sumber lain.
{
  const slug = "slug-e";
  const { data, calls } = await run(slug, {
    detail: detailOf(slug, [KIRYUU]),
    komiku: () => true,
    kiryuu: true,
    komikcast: true,
  });
  assert.deepEqual(calls, [`komiku:/${slug}-chapter-5/`]);
  assert.equal(data.source, "komiku");
  assert.equal(data.mangaSlug, "x");
}

// 7. Detail sudah di cache: langsung jalur gabungan, Mahwaindo memakai URL daftar, 1 kali saja.
{
  const slug = "slug-g";
  const real = `/${slug}-asli-chapter-5/`;
  const { data, calls } = await run(slug, {
    detail: detailOf(slug, [{ source: "komiku", url: real }, KIRYUU]),
    peek: true,
    komiku: (u) => u === real,
    kiryuu: true,
    komikcast: true,
  });
  assert.deepEqual(calls, ["detail", `komiku:${real}`]);
  assert.equal(data.prevUrl, "/n4");
  assert.equal(data.nextUrl, "/n6");
}

// 8. Semua sumber gagal: error dilempar, tidak menggantung.
{
  const slug = "slug-h";
  log.length = 0;
  cfg = {
    detail: detailOf(slug, [{ source: "komiku", url: `/${slug}-chapter-5/` }, KIRYUU, { source: "komikcast", url: "/kc/5/" }]),
    komiku: () => false,
    kiryuu: false,
    komikcast: false,
  };
  await assert.rejects(() => getChapter(slug, "5"), /komikcast gagal/);
  assert.deepEqual(log, [`komiku:/${slug}-chapter-5/`, "detail", "kiryuu-id:cid5", "komikcast:/kc/5/"]);
}

console.log("chapter-auto.test: OK");
