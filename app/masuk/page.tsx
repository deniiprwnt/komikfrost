"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/lib/page-title";
import { BrandMark } from "@/components/brand-mark";

function MasukForm() {
  usePageTitle("Masuk");
  const router = useRouter();
  const sp = useSearchParams();
  // Hanya path internal yang diizinkan — tolak URL absolut ("https://…")
  // dan protocol-relative ("//evil") agar ?next= tidak jadi open-redirect.
  const rawNext = sp.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || "Gagal masuk.");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col items-center justify-center gap-4 px-4">
      <BrandMark className="h-12 w-12" />
      <div className="text-center">
        <h1 className="font-display text-xl font-extrabold text-fg dark:text-fg-dark">
          Komik<span className="text-accent">Frost</span>
        </h1>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          Situs pribadi — masukkan kata sandi untuk melanjutkan.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full min-w-0 flex-col gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Kata sandi"
          autoFocus
          autoComplete="current-password"
          enterKeyHint="go"
          className="h-12 w-full min-w-0 rounded-full border border-line bg-paper-2 px-4 text-base text-fg outline-none placeholder:text-muted focus-visible:border-accent sm:h-11 sm:text-sm dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
        />
        {error && (
          <p className="rounded-xl border border-mark-manga/30 bg-mark-manga/5 px-4 py-2.5 text-center text-sm text-mark-manga">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !pw}
          className="h-12 w-full rounded-full bg-accent text-sm font-semibold text-white disabled:opacity-50 sm:h-11"
        >
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}

export default function MasukPage() {
  return (
    <Suspense>
      <MasukForm />
    </Suspense>
  );
}
