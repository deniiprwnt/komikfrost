import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLatest, getPopular, getRecommended } from "@/lib/api/manga";
import { guard, handle } from "../_lib";

export const dynamic = "force-dynamic";
// Rantai scrape multi-source bisa melewati batas default lama (10 dtk) saat
// satu upstream lambat — 504 membuat beranda kosong.
export const maxDuration = 30;

type HomeData = { latest: unknown[]; popular: unknown[]; recommended: unknown[] };

/**
 * Cache respons per-instance 30 detik.
 * `dynamic = force-dynamic` membuat fetch upstream no-store, tapi
 * /api/home menembak 3 source scrape (2-6 dtk). Cache memori ini
 * menghilangkan KERJA SCRAPE saja — guard (gate+rate limit) tetap
 * jalan di SETIAP request. Tanpa Cache-Control publik.
 *
 * Kenapa 30 dtk, bukan 60 dtk: auto-refresh beranda (useAutoRefresh)
 * berjalan tiap 60 dtk. Bila cache juga 60 dtk, cek background di detik
 * ke-60 hampir selalu menabrak cache yang masih segar — komik baru tidak
 * terdeteksi sampai cek berikutnya (efektif 120 dtk). TTL di bawah
 * interval memastikan setiap cek mendapat data hasil scrape baru.
 */
const CACHE_MS = 30_000;
const CACHE_SECONDS = CACHE_MS / 1000;
let cache: { at: number; data: HomeData } | null = null;
let inflight: Promise<HomeData> | null = null;

async function buildHome(): Promise<HomeData> {
  const [latest, popular, recommended] = await Promise.all([
    getLatest(1).catch(() => [] as unknown[]),
    getPopular().catch(() => [] as unknown[]),
    getRecommended().catch(() => [] as unknown[]),
  ]);
  if (latest.length === 0 && popular.length === 0 && recommended.length === 0) {
    throw new Error("upstream-empty");
  }
  cache = { at: Date.now(), data: { latest, popular, recommended } };
  return cache.data;
}

export async function GET(req: NextRequest) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(
      { data: cache.data },
      {
        headers: {
          "Cache-Control": `private, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
        },
      },
    );
  }
  if (!inflight) inflight = buildHome().finally(() => { inflight = null; });
  const pending = inflight;
  return handle(() => pending, { revalidate: CACHE_SECONDS, scope: "private" });
}
