import type { ReactNode } from "react";

/**
 * Halaman detail TIDAK memaksa gulir ke atas di sini.
 *
 * Sebelumnya template memasang ScrollToTop di setiap navigasi — termasuk
 * back dari reader, sehingga kembali ke detail selalu melompat ke atas dan
 * terasa seperti memuat ulang. Posisi gulir sekarang satu sumbernya:
 * components/nav-memory.tsx (maju → atas, kembali → posisi tersimpan).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
