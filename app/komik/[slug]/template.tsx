import type { ReactNode } from "react";
import { ScrollToTop } from "@/components/scroll-to-top";

/**
 * Berbeda dari layout, template DIPASANG ULANG tiap navigasi ke halaman
 * detail (termasuk pindah antar-komik). Cocok untuk memaksa posisi gulir
 * ke atas: skeleton (loading.tsx) maupun konten langsung mulai dari atas.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollToTop />
      {children}
    </>
  );
}
