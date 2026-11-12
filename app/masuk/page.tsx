"use client";

import { Suspense, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/lib/page-title";
import { BareScreen, Scene } from "@/components/bare-screen";
import { BrandMark } from "@/components/brand-mark";
import { LockedDoor, type DoorState } from "@/components/scene-props";
import type { Mood } from "@/components/mascot";

/**
 * Validasi tujuan setelah login. `?next=` datang dari URL dan bisa diisi
 * siapa saja, jadi hanya path internal yang boleh lolos.
 *
 * Pemeriksaan string (`startsWith("/")`) tidak cukup: browser menormalkan
 * backslash menjadi slash untuk skema http(s), sehingga "/\evil.com"
 * menjadi "https://evil.com/". Di sini target di-resolve dulu, lalu origin
 * hasil resolve harus origin internal.
 */
function safeNext(raw: string): string {
  if (raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/";
  try {
    const u = new URL(raw, "https://internal.invalid");
    if (u.origin !== "https://internal.invalid") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

function MasukForm() {
  usePageTitle("Masuk");
  const router = useRouter();
  const sp = useSearchParams();
  // Hanya path internal yang diizinkan — tolak URL absolut ("https://…"),
  // protocol-relative ("//evil"), backslash ("/\evil" → "//evil" di browser),
  // dan karakter kontrol. Validasi pakai parser URL, bukan potongan string.
  const rawNext = sp?.get("next") || "/";
  const next = safeNext(rawNext);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [limited, setLimited] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setLoading(true);
    setError(null);
    setLimited(false);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 429) setLimited(true);
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Gagal masuk.");
      }
      // Pintu terbuka dulu sebentar, baru pindah halaman.
      setOk(true);
      await new Promise((r) => setTimeout(r, 750));
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk.");
      setShake((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  // Yuki ikut bereaksi: memeriksa → mencari, salah → galak, selain itu ramah.
  const mood: Mood = ok ? "happy" : limited ? "tired" : error ? "stern" : loading ? "lost" : "happy";
  const bubble = ok
    ? "Silakan masuk!"
    : limited
      ? "Hah… pelan-pelan, dong!"
      : error
        ? "Hmph! Ditolak."
        : loading
          ? "Sebentar, kucek dulu…"
          : "Kata sandinya apa?";
  const door: DoorState = ok ? "open" : error ? "denied" : loading ? "checking" : "idle";

  return (
    <BareScreen tone="teal">
      <main className="mg-wrap">
        <div className="mg-brand mg-in">
          <BrandMark className="h-7 w-7" />
          KomikFrost
        </div>
        <div className="mg-card mg-in" style={{ "--d": "80ms" } as CSSProperties}>
        <Scene
          mood={mood}
          fx={ok ? "open" : undefined}
          sfx={ok ? { jp: "ガチャッ", romaji: "gacha" } : error ? { jp: "ブブー", romaji: "bubuu" } : { jp: "カチャッ", romaji: "kacha" }}
          bubble={bubble}
          props={<LockedDoor state={door} />}
        />

        <section className="mg-form">
          <h1 className="mg-title">Selamat datang</h1>
          <p className="mg-desc">Situs pribadi. Masukkan kata sandi untuk melanjutkan membaca.</p>

          <form onSubmit={submit} className="mt-4 flex w-full min-w-0 flex-col gap-3 min-[860px]:mt-7 min-[860px]:gap-4">
            <div key={shake} className={shake ? "mg-shake" : undefined}>
              <label htmlFor="pw" className="mg-label">
                Kata sandi
              </label>
              <div className="mg-field">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mg-field-ico" aria-hidden="true">
                  <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
                  <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
                </svg>
                <input
                  id="pw"
                  className="mg-input"
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => {
                    setPw(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                  onBlur={() => setCaps(false)}
                  placeholder="••••••••"
                  autoFocus
                  autoComplete="current-password"
                  enterKeyHint="go"
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="mg-eye"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={show}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
                    {show ? (
                      <path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4.2 9.5 6a11.6 11.6 0 0 1-2.6 3.2M6.5 7.6A11.7 11.7 0 0 0 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                    ) : (
                      <>
                        <path d="M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {caps && (
                <p className="mg-caps">
                  <span aria-hidden="true">⇪</span> Caps Lock sedang aktif
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="mg-alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5M12 16v.01" />
                </svg>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || !pw} className="mg-btn mg-btn-primary mt-1 !h-[3rem] w-full min-[860px]:!h-[3.25rem]">
              {ok ? (
                "Berhasil!"
              ) : loading ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" className="mg-spin h-4 w-4" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Memeriksa…
                </>
              ) : (
                <>
                  Masuk
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M5 12h14m0 0-6-6m6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="mg-fine">Sesi tersimpan 30 hari di perangkat ini.</p>
        </section>
        </div>
      </main>
    </BareScreen>
  );
}

export default function MasukPage() {
  return (
    <Suspense>
      <MasukForm />
    </Suspense>
  );
}
