# KomikFrost 
 
Platform baca komik pribadi untuk **manga, manhwa, dan manhua** berbahasa
Indonesia. Antarmuka dibangun dengan Next.js App Router; seluruh data
(judul, cover, genre, sinopsis, chapter, peringkat, dan gambar reader)
diambil langsung dari sumber data eksternal melalui API internal.
 
> Proyek pribadi, bukan layanan publik. Nama sumber data sengaja tidak
> dicantumkan dalam dokumentasi ini. KomikFrost tidak menyimpan atau
> me-rehost konten komik.
 
## Fitur

### Jelajah

- **Beranda** — peringkat harian, update terbaru, dan rekomendasi acak.
- **Terbaru** — 15 komik per halaman + filter urutan, tipe, status, dan 2 genre.
- **Peringkat** — harian, mingguan, bulanan, dan semua waktu.
- **Genre** — daftar genre + pemilihan cepat hingga 2 genre.
- **Pencarian** — hasil live, ranking relevansi, dedupe lintas-halaman, dan
  label "hasil mirip" saat tidak ada kecocokan persis.
- **Detail komik** — sinopsis, metadata, genre, daftar chapter (urut naik/turun),
  serta komik serupa.

### Baca

- **Reader** — mode halaman & scroll, progress bar, lazy loading gambar, dan
  prefetch chapter berikutnya.
- **Pindah chapter** — dropdown chapter, tombol prev/next, overlay tap-nav, dan
  posisi baca terakhir diingat.
- **Riwayat** — otomatis menyimpan chapter dan progres baca (localStorage).
- **Favorit** — menyimpan komik + badge chapter baru (localStorage).

### Pengalaman aplikasi

- Navigasi client-side **tanpa reload halaman**; data tujuan dipanaskan saat
  hover/fokus/sentuh dan saat browser idle.
- Tema gelap/terang yang tersimpan per perangkat.
- PWA: manifest, ikon, splash screen, dan status bar iOS.
- Filter serta pagination tersimpan di URL, jadi tetap sama saat kembali atau
  refresh.
- Loading, error, dan empty state yang konsisten di semua halaman.

## Arsitektur

```text
Browser
  └─ Next.js App Router (shell halaman statis)
       └─ /api/* Route Handler (server-side)
            └─ sumber data eksternal
```

- Halaman berupa shell statis; data dimuat client-side dari `/api/*`.
- Route API melakukan fetch + parsing di server, lalu mengembalikan JSON yang
  seragam ke UI.
- Beberapa sumber digabung dan di-dedupe berdasarkan judul. Prioritas sumber
  menentukan data yang dipakai, dengan fallback otomatis per komik/chapter.
- Satu sumber gagal tidak menggagalkan hasil akhir (`fetchAllSettled`).

## Sumber data

Tiga sumber eksternal dipakai berlapis:

| Lapis | Peran |
|---|---|
| Utama | Metadata, daftar chapter, dan gambar reader terlengkap. |
| Fallback 1 | Cadangan saat sumber utama tidak memiliki judul/chapter. |
| Fallback 2 | Cadangan tambahan untuk pencarian dan daftar terbaru. |

Aturan penggabungan:

- Chapter dengan nomor sama → data dari sumber prioritas lebih tinggi menang.
- Judul dinormalisasi (lowercase, tanpa diakritik/tanda baca) untuk dedupe.
- Resolusi slug dilakukan bertahap; jika gagal, sumber berikutnya dicoba.

## Menjalankan

```bash
npm install
npm run dev
```

Cek tipe:

```bash
npm run typecheck
```

Buka `http://localhost:3000`.

Build production:

```bash
npm run build
npm start
```

### Environment

Buat `.env.local`:

```env
SITE_PASSWORD=password-rahasia
```

- Jika `SITE_PASSWORD` diisi, seluruh halaman dan `/api/*` dilindungi gerbang
  password (`/masuk`). Cookie sesi berupa token HMAC, bukan password mentah.
- Jika kosong, situs terbuka (mode pengembangan lokal).

## Struktur proyek

```text
app/
├── page.tsx                  # beranda
├── terbaru/                  # daftar + filter + pagination
├── populer/                  # peringkat
├── cari/                     # pencarian
├── genre/                    # daftar genre
├── genre/[slug]/             # komik per genre
├── komik/[slug]/             # detail komik
├── baca/[slug]/[chapter]/    # reader
├── favorit/                  # favorit (localStorage)
├── riwayat/                  # riwayat baca (localStorage)
├── masuk/                    # gerbang password
├── api/                      # route handler JSON
├── layout.tsx                # shell global (header, tab bar, footer)
├── loading.tsx               # fallback route
├── error.tsx                 # error boundary
└── not-found.tsx             # 404

components/                   # header, kartu, pagination, state, tema
lib/
├── api/                      # adapter + agregator sumber data
├── client.ts                 # fetcher + cache/SWR/dedupe
├── history.ts                # riwayat baca
├── bookmarks.ts              # favorit
├── gate.ts                   # sesi gerbang password
├── morph.ts                  # animasi cover
├── nav-prefetch.ts           # prefetch data menu
└── page-title.ts             # judul tab dinamis
```

## Cache & performa

- **Client cache** — TTL 30 detik, stale-while-revalidate hingga 5 menit, dan
  dedupe request yang sama.
- **Prefetch menu** — data tujuan dipanaskan saat hover/fokus/sentuh dan saat
  browser idle, sehingga pindah menu terasa instan.
- **Server cache** — `revalidate` per fetch untuk mengurangi beban sumber data.
- **Gambar** — lazy loading + `decoding="async"`; sebagian melalui proxy
  internal `/api/img` agar kompatibel dengan CDN sumber. Cache proxy 7 hari
  (URL gambar chapter memakai nama file unik) dengan header `private`.
- **Pagination** — 15 komik per halaman di Terbaru, Genre, dan Pencarian.

## Keamanan & privasi

- `robots.txt`, metadata `noindex`, dan header `X-Robots-Tag`.
- Gerbang password opsional dengan cookie HttpOnly dan SameSite=Lax.
- Rate limit API 60 request/menit/IP; proxy gambar punya bucket terpisah
  (600/menit) karena satu chapter berisi puluhan gambar.
- Header hardening: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, dan CSP `frame-ancestors`.
- Tidak ada kredensial pihak ketiga; hanya request GET ke halaman/API publik.

## Catatan

- Nama sumber data tidak dicantumkan di dokumentasi ini.
- Seluruh hak konten milik sumber masing-masing; proyek ini hanya menampilkan
  data secara langsung, tanpa menyimpan atau me-rehost konten.
- Dibuat untuk penggunaan pribadi.
- Jika `next build` berhenti karena rule ESLint `@next/next/no-img-element`
  tidak ditemukan (konfigurasi ESLint lama), jalankan `npx next build --no-lint`.
  Type-check tetap berjalan.
