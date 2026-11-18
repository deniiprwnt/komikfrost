#!/usr/bin/env python3
"""Patch lib/api/manga.ts: tier-sekuensial untuk getLatest & buildLatestPaged.

Mengganti pengambilan paralel 3-source dengan pendekatan bertingkat:
  Tier 1 Shinigami -> Tier 2 Komiku (filterUnseenCards) -> Tier 3 Komikcast
Pendekatan ini dipilih karena adapter upaya (fetchMangaList, fetchShiniLatest,
fetchKomikcastLatest) tidak mengubah signature. filterUnseenCards dan dedupeKeys
telah ditambahkan ke aggregator.ts.
"""
import sys

PATH = 'lib/api/manga.ts'

with open(PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# ------------------------------------------------------------------
# 1) getLatest: ganti comment + signature + body sampai mergeCards.
#    Anchor: comment line (ASCII) ... mergeCards block (ASCII).
# ------------------------------------------------------------------
gl_start_anchor = '/** Chapter terbaru'
gl_end_anchor = (
    '  const merged = mergeCards({\n'
    '    komiku: data.komiku ?? [],\n'
    '    shinigami: data.shinigami ?? [],\n'
    '    komikcast: data.komikcast ?? [],\n'
    '  });'
)
gl_start = content.find(gl_start_anchor)
gl_end = content.find(gl_end_anchor, gl_start)
if gl_start == -1 or gl_end == -1:
    print(f'FAIL getLatest: start={gl_start} end={gl_end}')
    sys.exit(1)
gl_end += len(gl_end_anchor)

gl_new = '''/**
 * Chapter terbaru (Shinigami is_update utama + Komiku ?orderby=modified
 * pelengkap). Tahap 1 deduplikasi sumber KomikFrost: Shinigami diambil
 * penuh; Komiku & Komikcast hanya menyertakan judul yang belum ditemukan
 * di sumber prioritas lebih tinggi (lihat filterUnseenCards). Ketiga
 * sumber tetap diperiksa setiap panggilan (termasuk probe live 60 dtk)
 * agar update terbaru dari sumber mana pun tetap terdeteksi.
 */
export async function getLatest(page = 1): Promise<MangaCard[]> {
  const params: MangaListParams = { orderby: "modified", page };
  // Tier 1: Shinigami (prioritas tertinggi). fetchAllSettled tetap dipakai
  // untuk partial-failure yang seragam -- bila Shinigami gagal, tier 2/3 tetap
  // jalan tanpa filter (seen kosong = semua lolos).
  const shiniRes = await fetchAllSettled(
    {
      shinigami: async () => {
        const { items } = await fetchShiniLatest(page);
        return items;
      },
    },
    "latest:shinigami",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, MangaCard[]>>, errors: {} }));
  const shiniCards = shiniRes.data.shinigami ?? [];
  // seen = kunci semua judul yang sudah ditemukan tier sebelumnya.
  const seen = new Set<string>();
  for (const c of shiniCards) for (const k of dedupeKeys(c)) seen.add(k);
  // Tier 2: Komiku -- hanya judul yang belum ada di Shinigami.
  const komikuRes = await fetchAllSettled(
    {
      komiku: async () => {
        // Coba 2x -- kegagalan fragment API sering cuma sementara (beban
        // bersamaan saat /api/home menembak beberapa request sekaligus),
        // jadi jangan langsung jatuh ke fetchHome() yang datanya lebih basi.
        // Total waktu (retry + fallback) dibatasi 10 dtk: kalau fragment API
        // sedang down, 2 retry (16 dtk) + fetchHome (5-8 dtk) bisa menahan
        // /api/home sampai 24 dtk. Timeout membuat source ini gagal cepat
        // sehingga agregator lanjut tanpa menunggu ekor lambatnya.
        const attempt = async () => {
          for (let i = 0; i < 2; i++) {
            try {
              const { items } = await fetchMangaList(params);
              if (items.length > 0) return items;
            } catch {
              // coba lagi (attempt berikutnya) sebelum fallback
            }
          }
          const home = await fetchHome();
          return page > 1 ? [] : home.latest;
        };
        return (await withTimeout(attempt(), 10_000)) ?? [];
      },
    },
    "latest:komiku",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, MangaCard[]>>, errors: {} }));
  const komikuCards = filterUnseenCards(komikuRes.data.komiku ?? [], seen);
  // Tier 3: Komikcast -- hanya judul yang belum ada di Shinigami+Komiku.
  // /api/v1/home -> latest_comic (tanpa paging upstream; hanya halaman 1
  // agar tidak duplikat antar halaman UI).
  const kcRes = await fetchAllSettled(
    {
      komikcast: async () => (page > 1 ? [] : fetchKomikcastLatest()),
    },
    "latest:komikcast",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, MangaCard[]>>, errors: {} }));
  const kcCards = filterUnseenCards(kcRes.data.komikcast ?? [], seen);
  const merged = mergeCards({
    komiku: komikuCards,
    shinigami: shiniCards,
    komikcast: kcCards,
  });'''

content = content[:gl_start] + gl_new + content[gl_end:]
print('OK getLatest patched')

# ------------------------------------------------------------------
# 2) buildLatestPaged: ganti dari genre2Vars sampai mergeCards.
# ------------------------------------------------------------------
blp_start_anchor = '  const genre2Vars = opts.genre2 ? upstreamGenreSlugs(opts.genre2) : [];'
blp_end_anchor = (
    '  const merged = mergeCards({\n'
    '    komiku: data.komiku?.items ?? [],\n'
    '    shinigami: data.shinigami?.items ?? [],\n'
    '    komikcast: data.komikcast?.items ?? [],\n'
    '  });'
)
blp_start = content.find(blp_start_anchor)
blp_end = content.find(blp_end_anchor, blp_start)
if blp_start == -1 or blp_end == -1:
    print(f'FAIL buildLatestPaged: start={blp_start} end={blp_end}')
    sys.exit(1)
blp_end += len(blp_end_anchor)

blp_new = '''  const genre2Vars = opts.genre2 ? upstreamGenreSlugs(opts.genre2) : [];
  // Tahap 1 deduplikasi sumber KomikFrost: tiap tier diambil terpisah,
  // hasil tier berprioritas lebih tinggi dipakai menyaring tier di
  // bawahnya (filterUnseenCards). Ketiga sumber tetap diperiksa setiap
  // panggilan (termasuk probe live 60 dtk) agar update terbaru dari sumber
  // mana pun tetap terdeteksi. Partial failure satu tier tidak menahan
  // tier lain (fetchAllSettled + .catch -> data kosong).
  // Tier 1: Shinigami (prioritas tertinggi).
  const shiniRes = await fetchAllSettled(
    {
      shinigami: async () => {
        const base = {
          pageSize: limit,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { format: opts.tipe } : {}),
        };
        if (genreVars.length === 0) return fetchShiniLatest(p, base);
        const hit = await firstWithItems(genreVars, (g) => fetchShiniLatest(p, { ...base, genre: g }));
        return hit ?? { items: [] as MangaCard[], hasNextPage: false };
      },
    },
    "latest-paged:shinigami",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, PagedResult<MangaCard>>>, errors: {} }));
  const shiniPaged = shiniRes.data.shinigami;
  const shiniCards = shiniPaged?.items ?? [];
  const seen = new Set<string>();
  for (const c of shiniCards) for (const k of dedupeKeys(c)) seen.add(k);
  // Tier 2: Komiku -- hanya judul yang belum ada di Shinigami.
  const komikuRes = await fetchAllSettled(
    {
      komiku: async () => {
        const base = {
          page: p,
          orderby,
          ...(opts.live ? { fresh: true } : {}),
          ...(opts.tipe ? { tipe: opts.tipe } : {}),
          ...(opts.genre2 ? { genre2: genre2Vars[0] ?? opts.genre2 } : {}),
          ...(opts.status ? { status: opts.status } : {}),
        };
        if (genreVars.length === 0) return fetchMangaList(base);
        const hit = await firstWithItems(genreVars, (g) => fetchMangaList({ ...base, genre: g }));
        return hit ?? { items: [] as MangaCard[], hasNextPage: false };
      },
    },
    "latest-paged:komiku",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, PagedResult<MangaCard>>>, errors: {} }));
  const komikuPaged = komikuRes.data.komiku;
  const komikuCards = filterUnseenCards(komikuPaged?.items ?? [], seen);
  // Tier 3: Komikcast -- hanya judul yang belum ada di Shinigami+Komiku.
  // Komikcast tanpa paging/filter upstream -- hanya halaman 1 tanpa filter.
  const kcRes = await fetchAllSettled(
    {
      komikcast: () =>
        p > 1 || opts.tipe || opts.genre || opts.genre2 || opts.status
          ? Promise.resolve({ items: [] as MangaCard[], hasNextPage: false })
          : fetchKomikcastLatest({ fresh: opts.live === true }).then((items) => ({ items, hasNextPage: false })),
    },
    "latest-paged:komikcast",
  ).catch(() => ({ data: {} as Partial<Record<ComicSourceId, PagedResult<MangaCard>>>, errors: {} }));
  const kcPaged = kcRes.data.komikcast;
  const kcCards = filterUnseenCards(kcPaged?.items ?? [], seen);
  const merged = mergeCards({
    komiku: komikuCards,
    shinigami: shiniCards,
    komikcast: kcCards,
  });'''

content = content[:blp_start] + blp_new + content[blp_end:]
print('OK buildLatestPaged patched')

# ------------------------------------------------------------------
# 3) hasNext line in buildLatestPaged.
# ------------------------------------------------------------------
old_hasnext = 'data.komiku?.hasNextPage || data.shinigami?.hasNextPage || data.komikcast?.hasNextPage,'
new_hasnext = 'komikuPaged?.hasNextPage || shiniPaged?.hasNextPage || kcPaged?.hasNextPage,'
if old_hasnext not in content:
    print('FAIL hasNext line not found')
    sys.exit(1)
content = content.replace(old_hasnext, new_hasnext)
print('OK hasNext patched')

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print('DONE: manga.ts written')
