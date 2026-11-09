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

/** 403 — gembok yang berusaha dibuka lalu terkunci lagi + pita peringatan + gelombang kejut. */
export function Padlock() {
  return (
    <div aria-hidden="true" className="mg-layer">
      <span className="mg-tape" />
      <span className="mg-ring" />
      <svg viewBox="0 0 48 56" className="mg-padlock absolute" fill="none">
        <path className="mg-shackle" d="M14 24 V17 a10 10 0 0 1 20 0 V24" stroke="var(--pk)" strokeWidth={3.4} strokeLinecap="round" />
        <rect x={6} y={23} width={36} height={28} rx={8} fill="var(--t)" />
        <circle cx={24} cy={35} r={3.6} fill="var(--sp)" />
        <path d="M24 37 V43" stroke="var(--sp)" strokeWidth={3.4} strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 401 — gerbang pemeriksaan: palang yang menolak naik + pemindai kartu. */
export function Checkpoint() {
  return (
    <div aria-hidden="true" className="mg-layer">
      <svg viewBox="0 0 40 78" className="mg-reader absolute" fill="none">
        <rect x={10} y={44} width={20} height={30} rx={3} fill="var(--pf)" stroke="var(--pk)" strokeWidth={2.4} />
        <rect x={2} y={4} width={36} height={46} rx={8} fill="var(--pf)" stroke="var(--pk)" strokeWidth={2.6} />
        <rect x={8} y={10} width={24} height={16} rx={4} fill="var(--sp)" stroke="var(--pk)" strokeWidth={1.8} />
        <rect className="mg-beam" x={9} y={11} width={22} height={1.8} rx={0.9} fill="var(--t)" />
        <path d="M13 34 H27" stroke="var(--pk)" strokeWidth={2.6} strokeLinecap="round" />
        <circle className="mg-led" cx={20} cy={42} r={3} fill="var(--t)" />
      </svg>
      <svg viewBox="0 0 200 24" className="mg-barrier absolute" fill="none">
        <rect x={2} y={4} width={188} height={16} rx={8} fill="var(--pf)" stroke="var(--pk)" strokeWidth={2.4} />
        <path d="M22 5 L34 19 M52 5 L64 19 M82 5 L94 19 M112 5 L124 19 M142 5 L154 19" stroke="var(--t)" strokeWidth={6} strokeLinecap="round" />
        <circle cx={186} cy={12} r={9} fill="var(--t)" stroke="var(--pk)" strokeWidth={2.4} />
      </svg>
    </div>
  );
}

/** 429 — uap panas + paket permintaan yang menyerbu Yuki. */
export function HeatWaves() {
  const w = "M0 0 C 6 -8, -6 -16, 0 -24 S 6 -40, 0 -48";
  const one = (left: string, top: string, delay: string) => (
    <svg viewBox="-20 -60 40 62" className="mg-steam absolute" style={{ width: "6cqw", left, top, animationDelay: delay }} fill="none">
      <path d={w} stroke="var(--pk)" strokeWidth={3.2} strokeLinecap="round" />
    </svg>
  );
  // [label, sisi, offset-x, top, delay] — deterministik agar SSR = client.
  const reqs: [string, "l" | "r", string, string, string][] = [
    ["GET", "l", "3cqw", "50cqw", "0s"],
    ["POST", "l", "1cqw", "64cqw", "-.8s"],
    ["GET", "r", "3cqw", "56cqw", "-.4s"],
    ["GET", "r", "2cqw", "70cqw", "-1.2s"],
    ["PUT", "l", "6cqw", "76cqw", "-1.7s"],
  ];
  return (
    <div aria-hidden="true" className="mg-layer">
      {one("36cqw", "33cqw", "0s")}
      {one("47cqw", "29cqw", "-.6s")}
      {one("58cqw", "34cqw", "-1.1s")}
      {reqs.map(([t, side, x, top, d], i) => (
        <span
          key={i}
          className="mg-req"
          style={{ [side === "l" ? "left" : "right"]: x, top, animationDelay: d, "--dx": side === "l" ? "17cqw" : "-17cqw" } as CSSProperties}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** 500 — letupan berulang: lonjakan, gelombang kejut, percikan, dan asap. */
export function Burst({ spikes = 14 }: { spikes?: number }) {
  // Deterministik (tanpa Math.random) agar SSR = client.
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * 2 * i) / (spikes * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? 96 + ((i * 37) % 15) : 66 + ((i * 23) % 8);
    pts.push(`${(100 + Math.cos(a) * r).toFixed(1)},${(100 + Math.sin(a) * r).toFixed(1)}`);
  }
  const d = `M${pts.join("L")}Z`;
  const sparks = Array.from({ length: 10 }, (_, i) => ({
    a: i * 36 + (i % 2 ? 9 : -6),
    r: 30 + ((i * 7) % 5) * 3,
    d: `${(i % 4) * 0.06}s`,
  }));
  return (
    <>
      <svg aria-hidden="true" viewBox="-4 -4 208 208" className="mg-burst absolute" fill="none">
        <path d={d} fill="var(--t)" opacity={0.28} />
        <path d={d} transform="translate(100 100) scale(.66) translate(-100 -100)" fill="var(--t)" opacity={0.3} />
      </svg>
      <div aria-hidden="true" className="mg-layer">
        <span className="mg-shock" />
        {sparks.map((p, i) => (
          <i key={i} className="mg-spark" style={{ "--a": `${p.a}deg`, "--r": `${p.r}cqw`, animationDelay: p.d } as CSSProperties} />
        ))}
        <span className="mg-puff" style={{ left: "40cqw", top: "27cqw" }} />
        <span className="mg-puff" style={{ left: "52cqw", top: "24cqw", animationDelay: "-1.1s" }} />
        <span className="mg-puff" style={{ left: "46cqw", top: "30cqw", animationDelay: "-2.2s" }} />
      </div>
    </>
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

export type DoorState = "idle" | "checking" | "denied" | "open";

/** Login — pintu lengkung: kunci masuk saat memeriksa, bergetar saat ditolak, terbuka bercahaya saat berhasil. */
export function LockedDoor({ state = "idle" }: { state?: DoorState }) {
  const arch = "M8 168 V56 C8 26 34 8 60 8 C86 8 112 26 112 56 V168 Z";
  const inner = "M20 168 V58 C20 34 40 20 60 20 C80 20 100 34 100 58 V168 Z";
  return (
    <svg aria-hidden="true" viewBox="0 0 120 170" className="mg-door absolute" data-state={state} fill="none">
      <defs>
        <linearGradient id="mg-door-glow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="1" stopColor="var(--t)" />
        </linearGradient>
      </defs>
      <path d={arch} fill="var(--sp)" stroke="var(--pk)" strokeWidth={3} strokeLinejoin="round" />
      <path className="mg-door-light" d={inner} fill="url(#mg-door-glow)" />
      <g className="mg-door-leaf">
        <path d={arch} fill="var(--pf)" stroke="var(--pk)" strokeWidth={3} strokeLinejoin="round" />
        <path d={inner} stroke="var(--pk)" strokeWidth={1.8} opacity={0.6} />
        <circle cx={90} cy={104} r={6} fill="var(--t)" />
        <circle className="mg-keyhole" cx={60} cy={96} r={7} fill="var(--sp)" stroke="var(--pk)" strokeWidth={2} />
        <path d="M57 98 H63 L65 112 H55 Z" fill="var(--sp)" />
        <g className="mg-door-key">
          <circle cx={60} cy={134} r={6} fill="none" stroke="var(--t)" strokeWidth={3.4} />
          <path d="M60 128 V100 M60 108 H66 M60 114 H65" stroke="var(--t)" strokeWidth={3.4} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
