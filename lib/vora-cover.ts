import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";

/**
 * Cover VoraToon di sisi klien: cache modul + antrean (maks 6 permintaan
 * bersamaan) supaya satu halaman penuh kartu tidak menembak puluhan request.
 */
const done = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const MAX_ACTIVE = 6;
const WAIT_MS = 4500;
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_ACTIVE) {
      active++;
      resolve();
    } else {
      waiting.push(() => {
        active++;
        resolve();
      });
    }
  });
}

function release(): void {
  active--;
  waiting.shift()?.();
}

function lookup(title: string): Promise<string | null> {
  const known = inflight.get(title);
  if (known) return known;
  const p = (async () => {
    await acquire();
    try {
      const r = await apiGet<{ cover: string | null }>(`/api/vora-cover?t=${encodeURIComponent(title)}`);
      const v = r?.cover ?? null;
      done.set(title, v);
      return v;
    } catch {
      return null; // gagal sementara: tidak di-cache, coba lagi di render berikutnya
    } finally {
      release();
    }
  })().finally(() => inflight.delete(title));
  inflight.set(title, p);
  return p;
}

/**
 * undefined = masih mencari, null = tidak ada (pakai cover 3 sumber),
 * string = URL cover VoraToon (sudah lewat proxy). Lewat WAIT_MS dianggap null
 * agar cover tidak tertahan; hasilnya tetap tersimpan untuk render berikutnya.
 */
export function useVoraCover(title?: string): string | null | undefined {
  const key = (title ?? "").trim();
  const [val, setVal] = useState<{ key: string; v: string | null } | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    const hit = done.get(key);
    if (hit !== undefined) {
      setVal({ key, v: hit });
      return;
    }
    let off = false;
    const t = window.setTimeout(() => {
      if (!off) setVal({ key, v: null });
    }, WAIT_MS);
    void lookup(key).then((v) => {
      if (off) return;
      window.clearTimeout(t);
      setVal({ key, v });
    });
    return () => {
      off = true;
      window.clearTimeout(t);
    };
  }, [key]);
  if (!key) return null;
  return val && val.key === key ? val.v : undefined;
}
