/**
 * Properti adegan (dekoratif, aria-hidden) untuk panel ilustrasi. Murni SVG,
 * tanpa hook → aman di server component. Warna lewat variabel CSS panel:
 * --pk (garis), --pf (isi), --t (aksen halaman). Ukuran memakai cqw.
 */
import type { CSSProperties } from "react";

/** 404 — halaman kosong melayang. */
export function MissingPages() {
  const page = (style: CSSProperties, delay: string, dashed = false) => (
    <svg viewBox="0 0 60 78" className="mg-float absolute" style={{ ...style, animationDelay: delay }} fill="none">
      <path d="M4 4 H44 L56 16 V74 H4 Z" fill={dashed ? "none" : "var(--pf)"} stroke="var(--pk)" strokeWidth={2.4} strokeLinejoin="round" strokeDasharray={dashed ? "5 5" : undefined} />
      {!dashed && <path d="M44 4 V16 H56" stroke="var(--pk)" strokeWidth={2.4} strokeLinejoin="round" />}
      <path d="M12 28 H48 M12 38 H40 M12 48 H46" stroke="var(--pk)" strokeWidth={2.2} strokeLinecap="round" opacity={0.7} />
    </svg>
  );
  return (
    <div aria-hidden="true" className="mg-layer">
      {page({ width: "12cqw", left: "9cqw", top: "50cqw", rotate: "-14deg" }, "0s")}
      {page({ width: "10cqw", right: "10cqw", top: "58cqw", rotate: "12deg" }, "-1.4s", true)}
      {page({ width: "8cqw", left: "34cqw", top: "6cqw", rotate: "8deg" }, "-2.6s", true)}
    </div>
  );
}

/** 403 — gembok kecil. */
export function Padlock() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 56" className="mg-padlock absolute" fill="none">
      <path d="M14 24 V17 a10 10 0 0 1 20 0 V24" stroke="var(--pk)" strokeWidth={3.4} strokeLinecap="round" />
      <rect x={6} y={23} width={36} height={28} rx={8} fill="var(--t)" />
      <circle cx={24} cy={35} r={3.6} fill="var(--sp)" />
      <path d="M24 37 V43" stroke="var(--sp)" strokeWidth={3.4} strokeLinecap="round" />
    </svg>
  );
}

/** 429 — uap panas. */
export function HeatWaves() {
  const w = "M0 0 C 6 -8, -6 -16, 0 -24 S 6 -40, 0 -48";
  const one = (left: string, top: string, delay: string) => (
    <svg viewBox="-20 -60 40 62" className="mg-steam absolute" style={{ width: "6cqw", left, top, animationDelay: delay }} fill="none">
      <path d={w} stroke="var(--pk)" strokeWidth={3.2} strokeLinecap="round" />
    </svg>
  );
  return (
    <div aria-hidden="true" className="mg-layer">
      {one("36cqw", "33cqw", "0s")}
      {one("47cqw", "29cqw", "-.6s")}
      {one("58cqw", "34cqw", "-1.1s")}
    </div>
  );
}

/** 500 — letupan lembut di belakang maskot. */
export function Burst({ spikes = 14 }: { spikes?: number }) {
  // Deterministik (tanpa Math.random) agar SSR = client.
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * 2 * i) / (spikes * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? 96 + ((i * 37) % 15) : 66 + ((i * 23) % 8);
    pts.push(`${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`);
  }
  const d = `M${pts.join("L")}Z`;
  return (
    <svg aria-hidden="true" viewBox="-4 -4 208 208" className="mg-burst absolute" fill="none">
      <path d={d} fill="var(--t)" opacity={0.28} />
      <path d={d} transform="translate(100 100) scale(.66) translate(-100 -100)" fill="var(--t)" opacity={0.3} />
    </svg>
  );
}

/** global-error — retakan tipis. */
export function Cracks() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="mg-cracks" fill="none">
      <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M62 46 L47 38 L41 22 L30 14 L26 0" />
        <path vectorEffect="non-scaling-stroke" d="M62 46 L78 33 L83 18 L97 9 L100 2" />
        <path vectorEffect="non-scaling-stroke" d="M62 46 L88 52 L94 66 L100 70" />
        <path vectorEffect="non-scaling-stroke" d="M62 46 L70 66 L64 80 L72 100" />
        <path vectorEffect="non-scaling-stroke" d="M62 46 L48 60 L30 64 L21 82 L8 88 L0 100" />
        <path vectorEffect="non-scaling-stroke" d="M62 46 L38 49 L22 40 L9 44 L0 38" />
      </g>
    </svg>
  );
}

/** Login — pintu dengan lubang kunci. */
export function LockedDoor() {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 170" className="mg-door absolute" fill="none">
      <path d="M8 168 V56 C8 26 34 8 60 8 C86 8 112 26 112 56 V168 Z" fill="var(--pf)" stroke="var(--pk)" strokeWidth={3} strokeLinejoin="round" />
      <path d="M20 168 V58 C20 34 40 20 60 20 C80 20 100 34 100 58 V168 Z" stroke="var(--pk)" strokeWidth={1.8} opacity={0.6} />
      <circle cx={86} cy={102} r={6} fill="var(--t)" />
    </svg>
  );
}
