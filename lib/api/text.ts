import type { Cheerio, CheerioAPI } from "cheerio";

/**
 * lib/api/text.ts â€” util teks dari HTML/JSON sumber.
 *
 * Masalah yang diselesaikan: mengambil `.text()` mentah dari HTML
 * menggabungkan teks antar elemen tanpa spasi, sehingga sinopsis terbaca
 * "lakilaki bernamaMonkey D Luffyyang menentang". Di sini batas SETIAP
 * elemen (blok maupun inline) diganti spasi SEBELUM teks diambil, lalu
 * spasi berlebih digabung jadi satu. Fungsi yang sama dipakai adapter
 * Komiku, Shinigami, dan Komikcast supaya hasilnya seragam.
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
 * Rapikan teks hasil penyisipan batas elemen: spasi yang muncul sebelum
 * tanda baca (akibat penggantian tag dengan spasi) dibuang.
 */
export function tidyText(raw: string): string {
  let s = collapseSpaces(raw);
  if (!s) return "";
  // Spasi sebelum tanda baca / penutup kurung tidak pernah benar.
  // Satu aturan saja: sisipan spasi batas-elemen selalu tepat SEBELUM
  // tanda baca, baik diikuti spasi berikutnya maupun di akhir teks.
  s = s.replace(/\s+([,.;:!?%)\]])(?=\s|$)/g, "$1");
  // Spasi sesudah buka kurung juga tidak perlu.
  s = s.replace(/([(\[])\s+/g, "$1");
  // Titik dua diikuti angka ("Chapter 1: 12") tetap; tapi spasi sebelum
  // titik dua yang datang dari tag ("Judul :") dirapatkan hanya bila
  // sebelumnya bukan akhir kalimat â€” dibiarkan di sini, terlalu agresif
  // untuk teks sinopsis bebas.
  return collapseSpaces(s);
}

/**
 * Teks sebuah elemen dengan spasi di batas elemen: <br>, tag blok, DAN tag
 * inline diganti spasi lebih dulu, script/style dibuang, baru teks diambil.
 *
 * Tag inline juga dipisah karena sumber sering memecah satu kalimat menjadi
 * beberapa <span>/<b>/<a>: tanpa spasi di batasnya, kata-kata menempel
 * ("kesannama", "orangorangbaru", "sertabersamasama").
 */
export function blockText($: CheerioAPI, el: Cheerio<never> | Cheerio<any>): string {
  if (!el || el.length === 0) return "";
  const clone = el.clone();
  clone.find("script, style, noscript").remove();
  clone.find("br").replaceWith(" ");
  clone.find("*").each((_, node) => {
    const tag = (node as { tagName?: string }).tagName?.toLowerCase();
    if (!tag) return;
    const $node = $(node);
    // Tutup setiap elemen dengan spasi â€” batas kata antar elemen.
    $node.append(" ");
    if (BLOCK_TAGS.has(tag)) $node.prepend(" ");
  });
  return tidyText(clone.text());
}

/**
 * Bersihkan sinopsis: tag HTML sisa â†’ spasi (bukan dihapus, supaya kata
 * tidak menempel), entity dasar dirapikan, spasi berlebih & spasi sebelum
 * tanda baca dibuang, teks placeholder upstream dibuang.
 *
 * Dipakai SEMUA adapter (Komiku, Shinigami, Komikcast) dan agregator, jadi
 * data lama yang ter-cache pun ikut dirapikan setiap kali dibaca.
 */
export function cleanSynopsis(raw?: string | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = String(raw);
  if (s.includes("<") || s.includes(">")) {
    s = s
      .replace(/<\s*br\s*\/?\s*>/gi, " ")
      .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ");
  }
  // `&amp;` didekode PALING AKHIR: "&amp;quot;" adalah teks literal
  // "&quot;", bukan tanda kutip, jadi urutan ini yang benar.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&hellip;/gi, "â€¦")
    .replace(/&mdash;/gi, "â€”")
    .replace(/&ndash;/gi, "â€“")
    .replace(/&[lr]squo;/gi, "'")
    .replace(/&[lr]dquo;/gi, '"')
    .replace(/&amp;/gi, "&");
  // Entitas NUMERIK (desimal & heksadesimal). Sumber memakai &#x20; untuk
  // spasi dan &#8217; untuk apostrof; dulu keduanya lolos mentah ke UI
  // ("Chapter&#x20;1"). Didekode sebelum tidyText agar spasinya ikut rapi.
  // Karakter kontrol / di luar rentang unicode dibuang jadi spasi.
  s = s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, code: string) => {
    const n =
      code[0].toLowerCase() === "x"
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
    if (!Number.isFinite(n) || n < 32 || n > 0x10ffff) return " ";
    try {
      return String.fromCodePoint(n);
    } catch {
      return " ";
    }
  });
  // Escape sisa JSON/atribut: \" dan \' tidak boleh tampil sebagai
  // garis miring terbalik di tengah sinopsis. Backslash berlipat
  // (mis. \\\"Nether Lord\\\") ikut dibersihkan.
  s = s.replace(/\\+(["'\\/])/g, "$1");
  // Kata sambung ganda ("dan dan") â€” dibatasi ke kata sambung umum,
  // jadi reduplikasi sah ("laki-laki", "hati-hati") tidak tersentuh.
  s = s.replace(
    /\b(dan|yang|itu|ini|juga|lalu|tetapi|namun|karena|untuk|dengan|dari|akan|telah|sudah|para|atau|serta)\s+\1\b/gi,
    "$1",
  );
  // Kata menempel akibat tag batas hilang ("lakilaki",
  // "bersenangsenang", "orangorangbaru"): sisipkan spasi pada pengulangan
  // kata. Diulang sampai stabil karena satu kalimat bisa memuat lebih dari
  // satu pengulangan ("orangorangbaru").
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/([a-z]{3,})\1/gi, "$1 $1");
    if (next === s) break;
    s = next;
  }
  // Ekor kata yang menempel pada kata umum ("orangbaru" â†’ "orang baru").
  s = s.replace(
    /\b([A-Za-z\u00C0-\u00FF]{4,})(baru|lama|yang|itu|ini|juga|lalu|tetapi|namun|karena|untuk|dengan|dari|akan|sudah|masih|kembali|tersebut)\b/gi,
    "$1 $2",
  );
  // Reduplikasi hasil pemisahan ditulis dengan tanda hubung
  // ("laki laki" â†’ "laki-laki", "orang orang" â†’ "orang-orang").
  s = s.replace(/(^|[^\w-])([A-Za-z\u00C0-\u00FF]{3,}) \2(?![\w-])/g, "$1$2-$2");
  // Kalimat yang menempel akibat tag dibuang ("berakhir.Dia"): beri spasi
  // setelah tanda akhir kalimat bila diikuti huruf besar. Hanya untuk
  // huruf, jadi angka desimal ("11.5") tidak tersentuh.
  s = s.replace(/([a-z]{2}[.!?â€¦])([A-Z])/g, "$1 $2");
  // IDEMPOTEN: dipanggil ulang pada teks yang sudah bersih (nilai cache lama,
  // sinopsis yang sudah lolos blockText) tidak boleh mengubah apa pun.
  // tidyText sendiri idempoten, jadi aman dijalankan pada data lama.
  s = tidyText(s);
  if (!s) return undefined;
  if (/^belum ada (isi|sinopsis|deskripsi)/i.test(s)) return undefined;
  // Jangan pernah tampilkan sinopsis yang berakhir di tengah kalimat.
  return trimToLastSentence(s);
}

/**
 * Potong teks pada AKHIR KALIMAT utuh terakhir bila teks berakhir di tengah
 * kalimat. Hanya berlaku untuk teks panjang (>=160 huruf) dan bila akhir
 * kalimat terakhir masih mencakup >=60% teks â€” jadi sinopsis satu kalimat
 * tanpa titik penutup tidak ikut dikosongkan.
 *
 * Idempoten: dipanggil ulang pada teks yang sudah berakhir di tanda baca
 * tidak mengubah apa pun (akhir kalimat terakhir = panjang teks).
 */
export function trimToLastSentence(raw: string): string {
  const s = (raw ?? "").trim();
  if (s.length < 160) return s;
  const re = /[.!?\u2026]["')\]]?(?=\s|$)/g;
  let end = -1;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    end = (m.index ?? 0) + m[0].length;
  }
  if (end < 0 || end >= s.length) return s;
  if (end < s.length * 0.6) return s;
  return s.slice(0, end).trim();
}

/**
 * Ringkas teks pada BATAS KALIMAT, bukan di tengah kata/kalimat.
 * Dipakai untuk sinopsis kartu: kalimat terakhir yang utuh di dalam batas
 * dipertahankan; bila tidak ada, potong di batas kata + elipsis.
 */
export function shortenAtSentence(raw: string | undefined | null, max: number): string {
  const s = (raw ?? "").trim();
  if (!s || !Number.isFinite(max) || max <= 0 || s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastStop = cut.search(/[.!?â€¦](?=[\s"')\]]|$)(?![\s\S]*[.!?â€¦](?=[\s"')\]]|$))/);
  if (lastStop > 0 && lastStop + 1 >= Math.floor(max * 0.4)) {
    return cut.slice(0, lastStop + 1).trim();
  }
  const sp = cut.lastIndexOf(" ");
  const base = (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:â€“-]+$/, "");
  return base ? base + "â€¦" : s.slice(0, max);
}
