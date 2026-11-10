"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Baris mono kecil di dasar kartu status: jalur yang gagal + jam lokal.
 * Diisi setelah mount (butuh `window`), jadi tidak memicu hydration mismatch.
 */
export function SxMeta({ code, note }: { code: string; note?: ReactNode }) {
  const [info, setInfo] = useState<{ path: string; time: string } | null>(null);

  useEffect(() => {
    const clock = () =>
      new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");
    setInfo({ path: window.location.pathname + window.location.search, time: clock() });
    const id = setInterval(() => setInfo((p) => (p ? { ...p, time: clock() } : p)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sx-meta">
      <span className="path">GET {info?.path ?? "…"}</span>
      <span>
        <b>{code}</b> · {info?.time ?? "--:--:--"}
      </span>
      {note && <span className="ref">{note}</span>}
    </div>
  );
}
