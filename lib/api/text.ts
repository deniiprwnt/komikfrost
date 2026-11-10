import type { Cheerio, CheerioAPI } from "cheerio";

/**
 * lib/api/text.ts — util teks dari HTML/JSON sumber.
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
  // sebelumnya bukan akhir kalimat — dibiarkan di sini, terlalu agresif
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
    // Tutup setiap elemen dengan spasi — batas kata antar elemen.
    $node.append(" ");
    if (BLOCK_TAGS.has(tag)) $node.prepend(" ");
  });
  return tidyText(clone.text());
}

/** Entitas bernama yang umum muncul di sinopsis sumber. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  amp: "&",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  deg: "°",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

/** Satu putaran dekode entitas (bernama + numerik desimal/heksadesimal). */
function decodeEntitiesOnce(input: string): string {
  return input
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, code: string) => {
      const n =
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : parseInt(code, 10);
      // Karakter kontrol / di luar rentang unicode dibuang jadi spasi.
      if (!Number.isFinite(n) || n < 32 || (n >= 0x7f && n <= 0x9f) || n > 0x10ffff) return " ";
      try {
        return String.fromCodePoint(n);
      } catch {
        return " ";
      }
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Pengulangan kata yang SAH ditulis dengan tanda hubung di Bahasa Indonesia.
 * Hanya token UTUH berbentuk "<kata><kata>" yang disentuh ("lakilaki" →
 * "laki-laki") dan hanya untuk kata dasar yang dikenal. Kata biasa yang
 * kebetulan memuat pengulangan ("tantangan", "mengerjakan", "menciptakan")
 * tidak pernah terpengaruh karena bukan token utuh <kata><kata>.
 */
const REDUP_BASES = new Set([
  "laki",
  "orang",
  "anak",
  "hati",
  "senang",
  "kupu",
  "kura",
  "ubur",
  "cumi",
  "laba",
  "pura",
  "mata",
  "tiba",
  "sia",
  "rumah",
  "sehari",
  "biasa",
]);

function fixGluedReduplication(s: string): string {
  return s.replace(/\b([A-Za-z]{3,})\1\b/gi, (m, w: string) =>
    w === m.slice(w.length) || w.toLowerCase() === m.slice(w.length).toLowerCase()
      ? REDUP_BASES.has(w.toLowerCase())
        ? `${w}-${m.slice(w.length)}`
        : m
      : m,
  );
}

/**
 * Bersihkan sinopsis: tag HTML sisa → spasi (bukan dihapus, supaya kata
 * tidak menempel), entity (termasuk yang ter-encode ganda) didekode,
 * escape backslash dibuang, camelCase yang menempel dipisah, spasi berlebih
 * & spasi sebelum tanda baca dirapikan, teks placeholder upstream dibuang.
 *
 * TIDAK ada heuristik "pecah kata di tengah" (pengulangan huruf / ekor kata):
 * heuristik itu dulu merusak kata sah — "tantangan" → "tan tangan",
 * "mengerjakan" → "mengerj akan", "menciptakan" → "menciptak akan".
 * Pemisahan kata hanya dilakukan di batas yang pasti: huruf kecil → Huruf
 * Besar (camelCase) dan tanda baca yang menempel pada kata berikutnya.
 *
 * IDEMPOTEN: dipanggil ulang pada teks yang sudah bersih (nilai cache lama)
 * tidak mengubah apa pun.
 */
export function cleanSynopsis(raw?: string | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = String(raw);
  // Escape literal hasil serialisasi JSON/atribut. Dilakukan SEBELUM
  // dekode entity agar "&amp;" ikut tertangani.
  s = s.replace(/\\u([0-9a-f]{4})/gi, (_m, h: string) => {
    const n = parseInt(h, 16);
    return n < 32 ? " " : String.fromCharCode(n);
  });
  // "\\n" (escape berlapis) selalu spasi; "\n"/"\r" tunggal hanya bila
  // setelahnya BUKAN huruf kecil — "\nama" lebih mungkin backslash nyasar
  // di depan kata "nama" daripada baris baru + "ama".
  s = s.replace(/\\{2,}[nrt]/g, " ");
  s = s.replace(/\\[nr](?![a-z])/g, " ");
  s = s.replace(/\\t(?![a-z])/g, " ");
  // Dekode entity + buang tag sampai stabil (maks 3 putaran): sumber sering
  // meng-encode ganda ("&amp;quot;", "&lt;br&gt;").
  for (let i = 0; i < 3; i++) {
    let next = s;
    if (next.includes("&")) next = decodeEntitiesOnce(next);
    if (next.includes("<") || next.includes(">")) {
      next = next
        .replace(/<\s*br\s*\/?\s*>/gi, " ")
        .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, " ")
        .replace(/<\/?[a-z][^>]*>/gi, " ");
    }
    if (next === s) break;
    s = next;
  }
  // Backslash sisa: \" \' \/ \\ kehilangan garis miringnya; backslash lain
  // yang tersisa dibuang (tidak pernah bagian dari teks sinopsis).
  s = s.replace(/\\+(["'/])/g, "$1").replace(/\\+/g, "");
  // Kata sambung ganda ("dan dan") — dibatasi ke kata sambung umum,
  // jadi reduplikasi sah ("laki-laki", "hati-hati") tidak tersentuh.
  s = s.replace(
    /\b(dan|yang|itu|ini|juga|lalu|tetapi|namun|karena|untuk|dengan|dari|akan|telah|sudah|para|atau|serta)\s+\1\b/gi,
    "$1",
  );
  // camelCase yang menempel akibat tag batas hilang ("bernamaMonkey" →
  // "bernama Monkey"). Hanya kata yang SELURUHNYA huruf kecil (>=3) sebelum
  // Huruf Besar + huruf kecil, jadi "YouTube", "McDonald", "iPhone", "JoJo",
  // "DANDADAN" tidak ikut terpecah.
  s = s.replace(/\b[a-z]{3,}(?=[A-Z][a-z])/g, (w) => `${w} `);
  // Reduplikasi menempel yang dikenal ("lakilaki" → "laki-laki").
  s = fixGluedReduplication(s);
  // Tanda baca menempel pada kata berikutnya: "berakhir.Dia", "kata,kata".
  s = s.replace(/([a-z]{2}[.!?…])(?=[A-Z][a-z])/g, "$1 ");
  s = s.replace(/([a-z]{2}[,;])(?=[A-Za-z])/g, "$1 ");
  s = s.replace(/\s+([,;])(?=[A-Za-z])/g, "$1 ");
  s = tidyText(s);
  if (!s) return undefined;
  if (/^(belum ada|tidak ada|no) (isi|sinopsis|deskripsi|synopsis|description)/i.test(s)) {
    return undefined;
  }
  if (!isMeaningfulSynopsis(s)) return undefined;
  // Jangan pernah tampilkan sinopsis yang berakhir di tengah kalimat.
  return trimToLastSentence(s);
}

/**
 * Sinopsis BERMAKNA? Sumber kadang mengisi kolom sinopsis dengan penanda
 * kosong ("-", "...", "N/A", "TBA", "Sinopsis", "Coming soon") atau hanya
 * satu-dua kata. Teks seperti itu dulu lolos sebagai sinopsis valid, jadi
 * sinopsis dianggap SUDAH ADA dan pencarian sinopsis di sumber lain
 * (fallback lintas sumber/alias) tidak pernah dijalankan — halaman detail
 * dan cuplikan pencarian akhirnya kosong/berisi "-".
 * Tidak ada sinopsis yang dikarang: yang bermakna diambil dari sumber,
 * yang tidak bermakna dianggap kosong.
 */
export function isMeaningfulSynopsis(raw?: string | null): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  const letters = s.replace(/[^\p{L}]/gu, "");
  // Kurang dari 15 huruf / kurang dari 3 kata = bukan sinopsis.
  if (letters.length < 15) return false;
  if (s.split(/\s+/).length < 3) return false;
  if (
    /^(n\/?a|tba|tbd|none|null|undefined|coming soon|sinopsis|synopsis|deskripsi|description|segera hadir|-+|\.+|…+)[\s.!:-]*$/i.test(
      s,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Skor KUALITAS sinopsis (lebih tinggi = lebih baik). Dipakai
 * pickBestSynopsis untuk memilih dari semua sumber, termasuk nilai lama
 * yang ter-cache: teks yang bersih, panjang, dan berakhir di kalimat utuh
 * menang; teks rusak (entity/backslash/tag sisa, mojibake, kata menempel)
 * dihukum berat.
 */
export function synopsisQuality(raw?: string | null): number {
  const s = cleanSynopsis(raw);
  if (!s) return -Infinity;
  let score = Math.min(s.length, 700);
  if (s.length < 40) score -= 150;
  else if (s.length < 80) score -= 60;
  if (!/[.!?…"')\]]$/.test(s)) score -= 80;
  if (/…$|\.\.\.$/.test(s)) score -= 40;
  if (/&#?\w+;/.test(s)) score -= 200;
  if (/[\\<>]/.test(s)) score -= 200;
  if (/â€|Ã[\u0080-¿]|�/.test(s)) score -= 300;
  const glued = s.match(/\b[a-z]{3,}[A-Z][a-z]/g);
  if (glued) score -= 100 * glued.length;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) score -= 150;
  return score;
}

/**
 * Pilih sinopsis TERBAIK dari kandidat (urutan = prioritas sumber, paling
 * dipercaya dulu). Deterministik: skor kualitas + bonus kecil untuk sumber
 * berprioritas lebih tinggi; seri → kandidat paling awal. Mengembalikan
 * teks yang sudah dibersihkan, atau undefined bila semua kosong/placeholder.
 */
export function pickBestSynopsis(
  candidates: ReadonlyArray<string | null | undefined>,
): string | undefined {
  let best: string | undefined;
  let bestScore = -Infinity;
  candidates.forEach((raw, i) => {
    const cleaned = cleanSynopsis(raw);
    if (!cleaned) return;
    const score = synopsisQuality(cleaned) + Math.max(0, 40 - i * 20);
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  });
  return best;
}

/**
 * Potong teks pada AKHIR KALIMAT utuh terakhir bila teks berakhir di tengah
 * kalimat. Hanya berlaku untuk teks panjang (>=160 huruf) dan bila akhir
 * kalimat terakhir masih mencakup >=60% teks — jadi sinopsis satu kalimat
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
  const lastStop = cut.search(/[.!?\u2026](?=[\s"')\]]|$)(?![\s\S]*[.!?\u2026](?=[\s"')\]]|$))/);
  if (lastStop > 0 && lastStop + 1 >= Math.floor(max * 0.4)) {
    return cut.slice(0, lastStop + 1).trim();
  }
  const sp = cut.lastIndexOf(" ");
  const base = (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:\u2013-]+$/, "");
  return base ? base + "\u2026" : s.slice(0, max);
}
