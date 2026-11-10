# Laporan Audit & Perbaikan Bug — KomikFrost

**Tanggal audit:** 10 November 2026
**Commit dasar:** `295d74a`
**Status:** 16 bug diperbaiki, 3 klaim dicabut setelah verifikasi ulang, 1 ditinjau dan sengaja tidak diubah.

## Verifikasi setelah perbaikan

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npx next build` | EXIT 0 (semua route terbentuk) |
| Uji perilaku `chapterNum` / kunci token / `safeNext` / dedupe | lulus (lihat bagian akhir) |
| Suite e2e (`tests/*.e2e.ts`) | **tidak dijalankan ulang** (butuh server + runner agentic) |

**Urutan sumber data tidak berubah:** `SOURCE_PRIORITY = ["shinigami", "komiku", "komikcast"]` (`lib/api/aggregator.ts:25`) tetap utuh. Semua merge kartu, detail, dan chapter masih memakai urutan itu; tidak ada perubahan pada logika prioritas.

---

## Ringkasan

| ID | Keparahan | Masalah | Status |
|---|---|---|---|
| B-01 | Kritis | Halaman genre kosong saat kembali ke halaman 1 | ✅ Diperbaiki |
| B-02 | Tinggi | Halaman pencarian kosong saat halaman ≥ 2 dibuka ulang | ✅ Diperbaiki |
| B-03 | Tinggi | `88-10` terbaca `88.1` → tabrakan dengan `88-1` | ✅ Diperbaiki |
| B-04 | Tinggi | Spasi/panah di reader membajak input pencarian | ✅ Diperbaiki |
| B-05 | Tinggi | `?next=` bisa jadi open-redirect lewat backslash | ✅ Diperbaiki |
| B-06 | Sedang | Respons halaman genre bisa datang tidak berurutan | ✅ Diperbaiki |
| B-07 | Sedang | Rate limit percaya entri pertama `x-forwarded-for` | ✅ Diperbaiki |
| B-08 | Sedang | Login gagal menghabiskan kuota seluruh API | ✅ Diperbaiki |
| B-09 | Sedang | `guard()` meloloskan request tanpa Origin/Referer | ✅ Diperbaiki |
| B-10 | Sedang | Cache server `/api/img` tidak pernah aktif | ✅ Diperbaiki |
| B-11 | Sedang | `pruneSnapshots` melewatkan entri | ✅ Diperbaiki |
| B-12 | — | Prefetch `/api/latest` tidak terpakai | ❌ Dicabut (bukan bug) |
| B-13 | Rendah | Semua kartu `exactMatch` pada pencarian satu kata | ✅ Diperbaiki |
| B-14 | — | `ageTier` di `cardSig` membuat daftar berkedip | ❌ Dicabut (bukan bug) |
| B-15 | — | `peekApiCache` saat render → hydration mismatch | ❌ Dicabut (bukan bug) |
| B-16 | Rendah | Halaman terakhir mengembalikan > `limit` item | ⏸ Sengaja tidak diubah |
| B-17 | Rendah | `fetchJson` menahan 5 detik saat 401 | ✅ Diperbaiki |
| B-18 | Rendah | Zoom dinonaktifkan | ✅ Diperbaiki |
| B-19 | Rendah | Token berisi slug penuh → URL chapter digandakan (404) | ✅ Diperbaiki |

---

## Kritis

### B-01 — Halaman genre kosong saat kembali ke halaman 1 ✅

**Lokasi:** `app/genre/[slug]/page.tsx`

**Sebab:** `seenRef` menyimpan judul yang sudah tampil per filter dan hanya dihapus saat mount / ganti filter. Saat pengguna kembali ke halaman 1, seluruh judulnya sudah tercatat → semua tersaring → daftar kosong.

**Perbaikan:** pola dedupe diganti menjadi "hasil mentah per halaman" (`pagesRef: Map<filter, Map<halaman, kartu>>`). Dedupe dihitung ulang terhadap halaman `n < p` setiap kali halaman diterapkan. Halaman mana pun — termasuk halaman 1 yang dibuka ulang — selalu utuh, sementara duplikat lintas halaman tetap dibuang. Pola ini sama dengan yang sudah dipakai `/terbaru`.

---

## Tinggi

### B-02 — Halaman pencarian kosong saat dibuka ulang ✅

**Lokasi:** `app/cari/page.tsx`

**Sebab:** sama seperti B-01, dan reset hanya terjadi pada `p === 1`, sehingga alur 1 → 2 → 3 → 2 mengosongkan halaman 2.

**Perbaikan:** `seenRef` diganti `pagesRef: Map<kata kunci, Map<halaman, kartu>>`. Blok reset `p === 1` dihapus (tidak lagi diperlukan). Probe "halaman 2 punya judul baru?" kini membandingkan terhadap hasil halaman 1 yang tersimpan, bukan terhadap akumulasi semua halaman.

### B-03 — Nomor chapter `88-10` bertabrakan dengan `88-1` ✅

**Lokasi:** `lib/api/aggregator.ts`, `lib/api/chapter.ts`

**Sebab:** `parseFloat("88-10".replace(/-(\d+)$/, ".$1"))` → `parseFloat("88.10")` → `88.1`, identik dengan `88-1`.

**Perbaikan dua lapis:**

1. `chapterNum()` kini mengembalikan **ordinal basis 1000**, bukan desimal:
   `88` → `88000`, `88-1` → `88001`, `88-9` → `88009`, `88-10` → `88010`, `88.5` → `88005`. Urutan jadi benar dan tidak ada tabrakan. `numOf` di `mergeChapters` memakai fungsi yang sama (satu definisi).
2. Pencocokan chapter di reader **tidak lagi memakai selisih angka**, melainkan kunci string lewat `tokenChapterKey()` (`lib/api/chapter.ts`): `"88-10"`, `"88-10-bahasa-indonesia"`, dan `"Chapter 88-10"` semuanya menjadi `"88-10"`, sedangkan `"88-1"` tetap `"88-1"`. Titik desimal dinormalkan ke tanda hubung (`"88.5"` ≡ `"88-5"`) karena token URL memakai `-`.

`parseNumToken`/`numToken` **tetap** berbasis float karena dipakai sebagai `chapter_number` di API Shinigami — di sana angka desimal memang semantik yang benar.

**Efek:** daftar chapter terurut benar (`88-9` sebelum `88-10`), dan `/baca/<slug>/88-10` memuat chapter `88-10`, bukan `88-1`. Tombol next/prev ikut benar karena dihitung dari indeks chapter yang benar.

### B-04 — Spasi/panah di reader membajak input ✅

**Lokasi:** `app/baca/[slug]/[chapter]/page.tsx`

**Sebab:** handler `keydown` di `window` tidak memeriksa `e.target`. Kotak cari dropdown di-portal ke `<body>`, event-nya tetap menggelembung ke `window` → `preventDefault()` membatalkan pengetikan spasi dan `go(1)` memindah gambar.

**Perbaikan:** handler sekarang mengabaikan event yang `defaultPrevented`, ber-modifier (Ctrl/Meta/Alt), atau berasal dari `input, textarea, select, [contenteditable], button, a`. Spasi dan panah kembali berfungsi normal di kotak cari dan pada tombol.

### B-05 — `?next=` open-redirect lewat backslash ✅

**Lokasi:** `app/masuk/page.tsx`

**Sebab:** validasi string (`startsWith("/") && !startsWith("//")`) tidak menangkap `/\evil.com`; parser URL browser menormalkannya menjadi `https://evil.com/`.

**Perbaikan:** fungsi `safeNext()` baru memvalidasi dengan parser: tolak backslash dan karakter kontrol, resolve terhadap origin internal, lalu wajibkan hasilnya tetap ber-origin internal. Yang dikembalikan hanya `pathname + search + hash`.

**Terbukti:** `/\evil.com` → `/`, `//evil.com` → `/`, `https://evil.com` → `/`, sedangkan `/komik/one-piece?x=1` → tetap.

---

## Sedang

### B-06 — Respons genre bisa datang tidak berurutan ✅

**Lokasi:** `app/genre/[slug]/page.tsx`

**Perbaikan:** `loadPage(p, signal)` menerima `AbortSignal`. Satu `reqRef` menyimpan request aktif; memanggil `run(p)` membatalkan request sebelumnya. Error akibat abort tidak ditampilkan, dan `loading` tidak dimatikan oleh request yang sudah dibatalkan. Cleanup juga me-reset `bootedRef` agar StrictMode dev tidak membuat halaman menggantung.

### B-07 — Rate limit memakai entri pertama `x-forwarded-for` ✅

**Lokasi:** `lib/gate.ts`

**Perbaikan:** IP diambil dari `x-real-ip` bila ada; jika tidak, dari **entri terakhir** `x-forwarded-for` (hop yang ditambahkan proxy terdekat), bukan entri pertama yang bisa dikirim klien. Ini menutup dua arah penyalahgunaan: melewati limit dengan XFF acak, dan mengunci IP orang lain dengan XFF palsu.

### B-08 — Login gagal menghabiskan kuota API ✅

**Lokasi:** `app/api/gate/route.ts`

**Perbaikan:** gate memakai bucket sendiri dengan limit lebih ketat: `rateLimited(req, 10, "gate")`. Percobaan login tidak lagi memotong kuota 60/menit milik `/api/*`.

### B-09 — `guard()` meloloskan request tanpa Origin/Referer ✅

**Lokasi:** `app/api/_lib.ts`

**Perbaikan:** ditambahkan penolakan `403` bila `Sec-Fetch-Site: cross-site` — header ini dikirim browser pada request lintas origin, jadi celah "kedua header kosong" tidak lagi otomatis lolos untuk embed dari browser. Klien non-browser tetap tidak terpengaruh (gate password tetap lapisan utama).

### B-10 — Cache server `/api/img` tidak pernah aktif ✅

**Lokasi:** `app/api/img/route.ts`

**Perbaikan:** `export const dynamic = "force-dynamic"` dihapus. Opsi itu setara `fetchCache = "force-no-store"` sehingga `next: { revalidate: 604800 }` tidak pernah menghasilkan cache. Route tetap dinamis karena membaca `req.nextUrl.searchParams` (dikonfirmasi `next build`: route tetap ditandai `ƒ`). Sekarang proxy gambar benar-benar memakai Data Cache 7 hari seperti yang dijanjikan komentarnya.

### B-11 — `pruneSnapshots` melewatkan entri ✅

**Lokasi:** `lib/client.ts`

**Perbaikan:** kunci yang akan dihapus dikumpulkan dulu (`doomed`), baru dihapus setelah loop selesai — `removeItem` tidak lagi menggeser indeks saat iterasi. Ditambahkan parameter `force` yang dipakai pada jalur kuota penuh, sehingga prune tidak menjadi no-op hanya karena prune sebelumnya < 30 detik lalu.

---

## Rendah

### B-13 — `exactMatch` selalu `true` pada pencarian satu kata ✅
`lib/api/search.ts`: kartu satu-token kini ditandai `exactMatch: x.s > 0`. Kartu tanpa satu pun kecocokan tidak lagi dianggap "hasil persis", sehingga `/cari` tidak lagi selalu membuang satu request probe ke halaman 2.

### B-17 — `fetchJson` menahan 5 detik saat 401 ✅
`lib/client.ts`: promise penggantung diganti `throw` langsung setelah `window.location.href` diarahkan ke `/masuk`. Navigasi tetap berjalan; UI tidak lagi macet 5 detik bila navigasi diblokir (CSP/iframe).

### B-18 — Zoom dinonaktifkan ✅
`app/layout.tsx`: `maximumScale: 1` dan `userScalable: false` dihapus. Memenuhi WCAG 1.4.4; tata letak tidak berubah karena gambar reader sudah `w-full`.

### B-19 — Token berisi slug penuh membuat URL chapter digandakan ✅
`lib/api/chapter.ts`: URL sumber dirakit dengan `/${slug}-chapter-${token}/`. Bila token yang masuk ternyata slug chapter penuh (mis. `/baca/<slug>/<slug>-chapter-18`, terbawa dari riwayat, bookmark lama, atau tautan Komikcast `/<slug>-chapter-18-bahasa-indonesia/`), hasilnya `/<slug>-chapter-<slug>-chapter-18-bahasa-indonesia/` → **404 upstream**, sehingga reader tampil kosong.

Perbaikan: helper `bareChapterToken()` membuang sufiks `-bahasa-indonesia` **dan** prefiks `…-chapter-` sebelum URL dirakit. Dipakai di empat titik: override `?source=komiku`, fallback `?source=komikcast`, `komikuUrl`/`komikcastUrl` di `getChapterMerged`, plus `tokenChapterKey()` dan `parseNumToken()` supaya token berbentuk slug tetap cocok dengan daftar chapter gabungan (bukan hanya gagal lalu menebak URL).

**Terbukti** (server produksi lokal, satu slug): `18`, `18-bahasa-indonesia`, `<slug>-chapter-18`, dan `<slug>-chapter-18-bahasa-indonesia` semuanya `200` dengan data identik (26 gambar, prev/next sama). Sebelum perbaikan, dua bentuk terakhir menghasilkan URL ganda dan `404`.

---

## Klaim yang dicabut setelah verifikasi ulang

Tiga temuan di laporan pertama ternyata **bukan bug**. Saya cabut agar laporan ini tidak menyesatkan.

### B-12 — "Prefetch `/api/latest` tidak pernah terpakai" ❌
**Alasan dicabut:** path prefetch memang **sama persis** dengan yang dibaca halaman.
- Beranda: `useHomeSection("latest", false, "/api/latest?page=1&orderby=modified&limit=16&live=1")` → `withoutLive()` membuang `live=1` → `/api/latest?page=1&orderby=modified&limit=16`. Ini persis entri `NAV_API["/"]`.
- `/terbaru`: `latestApiPath(sp, page)` menghasilkan `/api/latest?page=1&orderby=modified`. Ini persis entri `NAV_API["/terbaru"]`.

Prefetch dipakai sebagai isi awal (`boot` / `useState` initializer), lalu request segar menggantikannya. Tidak ada request terbuang.

### B-14 — "`ageTier` di `cardSig` membuat daftar berkedip" ❌
**Alasan dicabut:** `listSig(list)` dan `listSig(current)` dihitung pada saat yang sama dengan `Date.now()` yang sama, sehingga `ageTier` untuk timestamp yang sama selalu identik. Perbandingan tidak pernah berbeda hanya karena waktu berjalan. Perbedaan hanya mungkin terjadi bila tepat melintasi batas tier di antara dua pemanggilan — jendela mikrodetik, bukan gejala yang bisa diamati.

### B-15 — "`peekApiCache` saat render → hydration mismatch" ❌
**Alasan dicabut:** `peekApiCache` hanya membaca `Map` di memori modul (`lib/client.ts:254-258`), **bukan** `localStorage`. Saat hidrasi pertama, modul klien baru dimuat sehingga Map kosong — sama dengan server. Kedua sisi merender `null`, tidak ada mismatch. Snapshot disk dibaca di dalam `useEffect` (`readApiSnapshot`), bukan saat render.

---

## Ditinjau dan sengaja tidak diubah

### B-16 — Halaman terakhir mengembalikan lebih dari `limit` ⏸
`lib/api/manga.ts:331`: `const items = hasNext ? ordered.slice(0, limit) : ordered;`

Memotong daftar ini akan **menghilangkan** judul yang tidak punya halaman lain untuk muncul (karena `hasNext` sudah `false`). Perilaku sekarang memastikan tidak ada konten yang hilang; efek sampingnya hanya ukuran halaman terakhir yang lebih besar. Perbaikan yang benar bukan memotong, melainkan menaikkan `hasNext`/pagination agar tiap halaman konsisten — perubahan desain, bukan perbaikan bug. Karena itu dibiarkan dan dicatat di sini.

---

## Catatan keamanan (di luar perbaikan)

1. **Token sesi tidak bisa dicabut** — cookie diturunkan dari HMAC(password) tanpa nonce; hanya berganti bila `SITE_PASSWORD` diganti. Keputusan desain, tidak diubah.
2. **`SITE_PASSWORD` kosong = situs terbuka** (`lib/gate.ts:39`) — disengaja untuk dev. Pertimbangkan gagal-tertutup saat `NODE_ENV === "production"` bila situs tidak pernah dimaksudkan publik.
3. **`safeEqual` keluar lebih awal saat panjang beda** — tidak berbahaya karena panjang token tetap dan sudah diperiksa pemanggil; hanya komentarnya ("constant-time") yang terlalu kuat.

---

## Bukti uji perilaku

Dijalankan dengan Node 24 (`--experimental-strip-types`) terhadap kode asli:

```
"Chapter 88.5"  -> 88-5   | "88-5" -> 88-5                 | sama: true
"88-10-bahasa-indonesia" -> 88-10 | "Chapter 88-10" -> 88-10 | sama: true
"Chapter 88-10" -> 88-10  | "88-1" -> 88-1                 | sama: false

next "/\evil.com"        -> "/"
next "//evil.com"        -> "/"
next "https://evil.com"  -> "/"
next "/komik/one-piece?x=1" -> "/komik/one-piece?x=1"

revisit p2: [ 'C', 'D' ]      (dulu: kosong)
revisit p1: [ 'A', 'B' ]      (dulu: kosong)
p3 dengan duplikat C: [ 'E' ] (dedupe lintas halaman tetap jalan)

chapterNum: 88=88000, 88-1=88001, 88-9=88009, 88-10=88010, 88.5=88005

# bareChapterToken (B-19)
"18"                                        -> bare "18"  | key "18"
"18-bahasa-indonesia"                       -> bare "18"  | key "18"
"chapter-18"                                -> bare "18"  | key "18"
"<slug>-chapter-18"                         -> bare "18"  | key "18"
"<slug>-chapter-18-bahasa-indonesia"        -> bare "18"  | key "18"
```

Uji runtime `next start` (build produksi, port 3124), endpoint `/api/chapter/<slug>/<token>`:

```
token=18                                      status=200 gambar=26 prev=…-chapter-17 next=…-chapter-19
token=18-bahasa-indonesia                     status=200 gambar=26 prev=…-chapter-17 next=…-chapter-19
token=<slug>-chapter-18                       status=200 gambar=26 prev=…-chapter-17 next=…-chapter-19
token=<slug>-chapter-18-bahasa-indonesia      status=200 gambar=26 prev=…-chapter-17 next=…-chapter-19
```

Sebelum perbaikan, dua bentuk terakhir memanggil Komikcast dengan URL berganda dan menerima `404`.

## Daftar file yang berubah

| File | Perubahan |
|---|---|
| `app/genre/[slug]/page.tsx` | B-01, B-06 |
| `app/cari/page.tsx` | B-02 |
| `lib/api/aggregator.ts` | B-03 (ordinal chapter) |
| `lib/api/chapter.ts` | B-03 (pencocokan kunci string), B-19 |
| `app/baca/[slug]/[chapter]/page.tsx` | B-04 |
| `app/masuk/page.tsx` | B-05 |
| `lib/gate.ts` | B-07 |
| `app/api/gate/route.ts` | B-08 |
| `app/api/_lib.ts` | B-09 |
| `app/api/img/route.ts` | B-10 |
| `lib/client.ts` | B-11, B-17 |
| `lib/api/search.ts` | B-13 |
| `app/layout.tsx` | B-18 |
