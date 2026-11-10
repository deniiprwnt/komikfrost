import type { Cheerio, CheerioAPI } from "cheerio";

/**
 * lib/api/text.ts â€” util teks dari HTML sumber.
 *
 * Masalah yang diselesaikan: mengambil `.text()` mentah dari HTML
 * menggabungkan teks antar elemen tanpa spasi, sehingga sinopsis terbaca
 * "lakilaki bernamaMonkey D Luffyyang menentang". Di sini batas tag
 * (<br>, blok, inline) diganti spasi SEBELUM teks diambil, lalu spasi
 * berlebih digabung jadi satu.
 */

/** Tag yang secara visual memisahkan baris/kata. */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Gabungkan semua spasi (termasuk newline/tab) jadi satu spasi. */
export function collapseSpaces(raw: string): string {
  return (raw || "").replace(/\s+/g, " ").trim();
}

/**
 * Teks sebuah elemen dengan spasi di batas elemen: <br> dan tag blok
 * diganti spasi lebih dulu, script/style dibuang, baru teks diambil.
 */
export function blockText($: CheerioAPI, el: Cheerio<never> | Cheerio<any>): string {
  if (!el || el.length === 0) return "";
  const clone = el.clone();
  clone.find("script, style, noscript").remove();
  clone.find("br").replaceWith(" ");
  clone.find("*").each((_, node) => {
    const tag = (node as { tagName?: string }).tagName?.toLowerCase();
    if (!tag || !BLOCK_TAGS.has(tag) || tag === "br") return;
    const $node = $(node);
    $node.prepend(" ");
    $node.append(" ");
  });
  return collapseSpaces(clone.text());
}

/** Bersihkan sinopsis: spasi rapi + buang teks placeholder upstream. */
export function cleanSynopsis(raw?: string | null): string | undefined {
  const s = collapseSpaces(raw ?? "");
  if (!s) return undefined;
  if (/^belum ada (isi|sinopsis|deskripsi)/i.test(s)) return undefined;
  return s;
}
