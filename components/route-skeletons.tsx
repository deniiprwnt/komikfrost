"use client";

/**
 * Skeleton yang butuh data dari URL (hook klien):
 * - Genre detail: judul "Genre: <Nama>" dari :slug.
 * - Cari: tampilkan placeholder hasil hanya bila ada ?q=.
 * Dipakai oleh loading.tsx DAN fallback <Suspense> di halamannya.
 */
import { useParams, useSearchParams } from "next/navigation";
import { CariSkeleton, GenreDetailSkeleton } from "@/components/skeletons";

export function GenreDetailRouteSkeleton() {
  const params = useParams<{ slug?: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const title = decodeURIComponent(slug)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return <GenreDetailSkeleton title={title} />;
}

export function CariRouteSkeleton() {
  const sp = useSearchParams();
  const hasQuery = Boolean(sp?.get("q")?.trim());
  return <CariSkeleton withResults={hasQuery} />;
}
