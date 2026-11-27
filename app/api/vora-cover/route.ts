import type { NextRequest } from "next/server";
import { proxiedImage } from "@/lib/api/img-proxy";
import { diagnoseVora, fetchVoraCover } from "@/lib/api/voratoon";
import { guard, handle } from "../_lib";

/**
 * GET /api/vora-cover?t=<judul>
 * Cover VoraToon untuk satu judul, sudah lewat proxy /api/img.
 * { cover: null } bila komik tidak ada di VoraToon (klien memakai cover 3 sumber).
 */
export async function GET(req: NextRequest) {
  // Satu halaman memanggil ~18 judul sekaligus: bucket sendiri dengan batas longgar.
  const blocked = await guard(req, { limit: 600, bucket: "vora" });
  if (blocked) return blocked;
  const title = (req.nextUrl.searchParams.get("t") || "").trim().slice(0, 200);
  // ?debug=1: tampilkan hasil tiap percobaan (membantu bila produksi diblokir VoraToon).
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return handle(() => diagnoseVora(title));
  }
  return handle(
    async () => {
      const raw = title ? await fetchVoraCover(title) : null;
      const cover = raw ? proxiedImage(raw) : "";
      return { cover: cover || null };
    },
    { revalidate: 3600, scope: "private" },
  );
}
