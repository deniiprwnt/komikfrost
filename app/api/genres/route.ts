import type { NextRequest } from "next/server";
import { getGenres } from "@/lib/api/genre";
import { guard, handle } from "../_lib";

export async function GET(req: NextRequest) {
  // Daftar genre jarang berubah — simpan 1 jam.
  const blocked = await guard(req);
  if (blocked) return blocked;
  return handle(() => getGenres(), { revalidate: 300, scope: "private" });
}
