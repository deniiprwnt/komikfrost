import { GridSkeleton } from "@/components/states";

/**
 * Fallback loading global — tampil otomatis saat pindah route selagi
 * server menyiapkan halaman. Skeleton shimmer yang sama dengan daftar
 * kartu, jadi transisi terasa menyambung, bukan layar kosong.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman">
      <div className="shimmer mb-3 h-6 w-40 rounded-lg" />
      <GridSkeleton count={10} />
    </div>
  );
}
