/**
 * Probe sekali-jalan: apakah Komikcast menyediakan endpoint komentar?
 * Jalankan: node scripts/probe-kc-comments.mjs
 * (Hanya membaca; tidak menulis data apa pun.)
 */
const BASE = "https://komikcast.top";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function get(path, accept = "application/json") {
  try {
    const res = await fetch(BASE + path, {
      headers: { "User-Agent": UA, Accept: accept, Referer: BASE + "/" },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    return { status: res.status, type: res.headers.get("content-type") || "", text };
  } catch (e) {
    return { status: 0, type: "", text: "ERR " + (e && e.message ? e.message : String(e)) };
  }
}

const brief = (t) => t.slice(0, 220).replace(/\s+/g, " ");

const paths = [
  "/api/v1/comments?page=1&per_page=5",
  "/api/v1/comments",
  "/api/v1/comments?series_slug=one-piece&page=1&per_page=5",
  "/api/v1/comments?type=series&slug=one-piece&page=1&per_page=5",
];

for (const p of paths) {
  const r = await get(p);
  console.log(`[JSON] ${r.status} ${r.type} ${p} :: ${brief(r.text)}`);
}

const home = await get("/api/v1/home");
console.log(`[HOME] ${home.status} ${home.type} :: ${brief(home.text)}`);

let seriesSlug = "";
let chapterSlug = "";
try {
  const j = JSON.parse(home.text);
  const latest = (j.latest_comic || [])[0];
  if (latest) {
    seriesSlug = latest.slug || "";
    chapterSlug = latest.latest_chapter ? latest.latest_chapter.slug || "" : "";
  }
} catch {}
console.log(`[IDS] series=${seriesSlug} chapter=${chapterSlug}`);

if (chapterSlug) {
  const cand = [
    `/api/v1/chapters/${chapterSlug}`,
    `/api/v1/chapters/${chapterSlug}/comments?page=1&per_page=5`,
    `/api/v1/comments?chapter_slug=${chapterSlug}&page=1&per_page=5`,
  ];
  for (const p of cand) {
    const r = await get(p);
    console.log(`[CH] ${r.status} ${r.type} ${p} :: ${brief(r.text)}`);
  }
  const page = await get(`/${chapterSlug}/`, "text/html");
  const html = page.text;
  console.log(`[HTML] ${page.status} len=${html.length} :: ${brief(html)}`);
  for (const kw of ["disqus", "waline", "giscus", "comment", "komentar", "utteranc"]) {
    const m = html.match(new RegExp(kw, "gi"));
    console.log(`[HTML-KW] ${kw} = ${m ? m.length : 0}`);
  }
  const idx = html.search(/comment|komentar/i);
  if (idx >= 0) {
    console.log(`[HTML-CTX] ${brief(html.slice(Math.max(0, idx - 150), idx + 250))}`);
  }
}
