import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Yuki, type Mood } from "@/components/mascot";
import { SceneMotion } from "@/components/scene-motion";

/**
 * Layar penuh tanpa chrome aplikasi (login, 403, 404, 429, 500, global-error).
 * Gaya: halaman manga — panel berbingkai tinta, bayangan keras, screentone,
 * garis fokus, efek suara (SFX) katakana, dan maskot Yuki.
 *
 * Menutup seluruh viewport; sidebar/header/footer/tab bar disembunyikan lewat
 * aturan `:has([data-bare-screen])` di globals.css. Tanpa hook → aman dipakai
 * dari server maupun client component.
 */
export type Tone = "teal" | "blue" | "amber" | "orange" | "red" | "violet";

export function BareScreen({
  children,
  tone = "teal",
  shock = false,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Adegan "kilat hitam" (latar hitam, garis putih) untuk kesalahan fatal. */
  shock?: boolean;
}) {
  return (
    <div
      data-bare-screen
      className={`bs bs-t-${tone}${shock ? " bs-shock" : ""} fixed inset-0 z-[300] overflow-y-auto overflow-x-hidden`}
    >
      <div aria-hidden="true" className="bs-tone-page" />
      <div className="bs-inner relative z-10 flex min-h-full items-center justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
        {children}
      </div>
    </div>
  );
}

/** Kelas tombol bersama. */
export const bsPrimary = "mg-btn mg-btn-primary";
export const bsGhost = "mg-btn";

export type Sfx = { jp: string; romaji: string };

/**
 * Panel ilustrasi: sorot cahaya halus + angka latar + maskot + SFX katakana
 * + gelembung ucapan. Dipakai StatusScreen dan halaman masuk.
 */
export function Scene({
  mood,
  sfx,
  bubble,
  code,
  props,
  fx,
}: {
  mood: Mood;
  sfx: Sfx;
  bubble: string;
  code?: string;
  props?: ReactNode;
  /** Efek sesaat dari luar, mis. "open" (login berhasil) / "rested" (429 pulih). */
  fx?: string;
}) {
  return (
    <div className="mg-scene" data-mood={mood} data-fx={fx} aria-hidden="true">
      <div className="mg-tone" />
      <div className="mg-focus" />
      <div className="mg-glow" />
      <div className="mg-motes">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      {code && <div className="mg-code">{code}</div>}
      {props}
      <div className="mg-yuki">
        <Yuki mood={mood} />
      </div>
      <p className="mg-bubble">{bubble}</p>
      <div className="mg-sfx">
        <b lang="ja">{sfx.jp}</b>
        <i>{sfx.romaji}</i>
      </div>
      <SceneMotion />
    </div>
  );
}

/**
 * Layar status generik: satu kartu — panel ilustrasi di kiri, teks + aksi di
 * kanan. Dipakai oleh 403, 404, 429, 500 dan global-error.
 */
export function StatusScreen({
  code,
  label,
  title,
  description,
  mood,
  tone = "teal",
  sfx,
  bubble,
  scene,
  extra,
  actions,
  links,
  note,
  shock = false,
}: {
  code: string;
  label: string;
  title: string;
  description: string;
  mood: Mood;
  tone?: Tone;
  sfx: Sfx;
  bubble: string;
  jp?: string;
  scene?: ReactNode;
  extra?: ReactNode;
  actions: ReactNode;
  links?: { href: string; label: string }[];
  note?: ReactNode;
  shock?: boolean;
}) {
  return (
    <BareScreen tone={tone} shock={shock}>
      <main role="main" className="mg-wrap">
        <div className="mg-card mg-in" style={{ "--d": "80ms" } as CSSProperties}>
          <Scene mood={mood} sfx={sfx} bubble={bubble} code={code} props={scene} />
          <div className="mg-body">
            <p className="mg-kicker">
              <span>{code}</span>
              {label}
            </p>
            <h1 className="mg-title">{title}</h1>
            <p className="mg-desc">{description}</p>
            {extra}
            <div className="mg-actions">{actions}</div>
            {links && links.length > 0 && (
              <div className="mg-links">
                <span>Mungkin kamu cari:</span>
                {links.map((l) => (
                  <Link key={l.href} href={l.href} className="mg-chip">
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
            {note && <p className="mg-note">{note}</p>}
          </div>
        </div>
      </main>
    </BareScreen>
  );
}

export function IconArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}
export function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5V11Z" />
    </svg>
  );
}
export function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  );
}
export function IconKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 3 3" />
    </svg>
  );
}
