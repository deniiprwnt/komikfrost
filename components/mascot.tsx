/**
 * Yuki — maskot KomikFrost: kelinci salju (yuki-usagi) bertelinga daun,
 * bersyal teal. Digambar sebagai SVG murni: garis tinta tebal, warna datar
 * + satu lapis bayangan cel. Satu komponen, enam ekspresi — dipakai oleh
 * halaman masuk dan semua layar error.
 *
 * Tanpa hook → aman dari server maupun client component. ID <clipPath>
 * statis (`yk-*`): pasang SATU maskot per halaman.
 */
export type Mood = "happy" | "lost" | "stern" | "tired" | "dizzy" | "faint" | "puzzled";

const INK = "#0d1518";
const SNOW = "#ffffff";
const SHADE = "#cfe5e2";
const LEAF = "#7fe3d6";
const SCARF = "#118079";
const MOUTH = "#5a1f2b";

/** Lengan: kapsul bergaris tinta (garis tebal tinta + garis putih di atasnya). */
function Arm({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={INK} strokeWidth={17} />
      <path d={d} stroke={SNOW} strokeWidth={9.5} />
    </g>
  );
}

/** Telinga daun; sisi kanan = cermin sisi kiri. `deg` memutar dari pangkalnya. */
function Ear({ deg, side }: { deg: number; side: "l" | "r" }) {
  const t = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g transform={t}>
      <g transform={`rotate(${deg} 90 80)`}>
        <path d="M80 80 C60 62 54 28 68 6 C90 20 102 52 100 82 Z" fill={SNOW} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
        <path d="M83 74 C72 58 69 36 73 21 C86 33 92 54 92 74 Z" fill={LEAF} />
        <path d="M81 72 C78 56 76 40 73 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
      </g>
    </g>
  );
}

/** Mata anime: tinta + iris teal + dua kilau. `look` menggeser pandangan. */
function Eye({ x, y, lx = 0, ly = 0, blink = true }: { x: number; y: number; lx?: number; ly?: number; blink?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
     <g className={blink ? "yk-blink" : undefined}>
      <ellipse rx={12.5} ry={16.5} fill={INK} />
      <g transform={`translate(${lx} ${ly})`}>
        <ellipse cy={2.5} rx={9.2} ry={12.6} fill="#1fb3a8" />
        <ellipse cy={5} rx={9.2} ry={8.6} fill="#0b6b66" opacity={0.55} />
        <ellipse cy={1} rx={5} ry={7.6} fill={INK} />
        <circle cx={-3.6} cy={-5.2} r={4.3} fill="#fff" />
        <circle cx={3.8} cy={5.4} r={2} fill="#fff" />
      </g>
     </g>
    </g>
  );
}

function Drop({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <path
      className={className}
      transform={`translate(${x} ${y})`}
      d="M0 -10 C6 -2 8 3 0 9 C-8 3 -6 -2 0 -10 Z"
      fill="#bfe3f6"
      stroke={INK}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Star({ x, y, s = 1, fill = "#f2c14e" }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -9 L2.6 -2.8 L9 -2.4 L4 1.8 L5.6 8.2 L0 4.6 L-5.6 8.2 L-4 1.8 L-9 -2.4 L-2.6 -2.8 Z"
      fill={fill}
      stroke={INK}
      strokeWidth={2.4}
      strokeLinejoin="round"
    />
  );
}

/** Tanda urat marah ala anime (💢) tanpa emoji. */
function Vein({ x, y }: { x: number; y: number }) {
  const p = "M-9 -3 Q-3 -3 -3 -9 M9 -3 Q3 -3 3 -9 M-9 3 Q-3 3 -3 9 M9 3 Q3 3 3 9";
  return (
    <g transform={`translate(${x} ${y})`} fill="none" strokeLinecap="round">
      <path d={p} stroke={INK} strokeWidth={7} />
      <path d={p} stroke="#e5483f" strokeWidth={3.4} />
    </g>
  );
}

function Spiral({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={15.5} fill="#fff" stroke={INK} strokeWidth={4} />
      <g className="yk-spin">
        <path
          d="M0 0 m-1.6 0 a1.6 1.6 0 1 1 3.2 0 a3.4 3.4 0 1 1 -6.8 0 a5.2 5.2 0 1 1 10.4 0 a7 7 0 1 1 -14 0"
          fill="none"
          stroke={INK}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

export function Yuki({ mood = "happy", className = "" }: { mood?: Mood; className?: string }) {
  const ears: Record<Mood, [number, number]> = {
    happy: [-5, 6],
    lost: [-4, 30],
    stern: [3, -3],
    tired: [-58, 58],
    dizzy: [-22, 24],
    faint: [-72, 72],
    puzzled: [-4, 48],
  };
  const [eL, eR] = ears[mood];

  return (
    <svg viewBox="0 0 220 224" overflow="visible" className={`yk yk-${mood} ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="yk-head">
          <ellipse cx={110} cy={108} rx={72} ry={58} />
        </clipPath>
      </defs>

      {/* tanah */}
      <ellipse cx={112} cy={216} rx={58} ry={6} fill={INK} opacity={0.16} />

      <g transform={mood === "faint" ? "rotate(-11 110 210)" : undefined}>
        <g className={mood === "faint" ? "yk-limp" : "yk-bob"}>
          {/* kaki */}
          <ellipse cx={92} cy={208} rx={15} ry={8} fill={SNOW} stroke={INK} strokeWidth={4.5} />
          <ellipse cx={128} cy={208} rx={15} ry={8} fill={SNOW} stroke={INK} strokeWidth={4.5} />

          {/* telinga */}
          <Ear deg={eL} side="l" />
          <Ear deg={eR} side="r" />

          {/* badan */}
          <path d="M78 156 C72 186 88 206 110 206 C132 206 148 186 142 156 Z" fill={SNOW} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M126 170 C132 190 124 202 110 204 C128 204 144 190 140 164 Z" fill={SHADE} />

          {/* lengan belakang (pose) */}
          {mood === "happy" && <Arm d="M80 178 Q62 172 54 152" />}
          {mood === "lost" && <Arm d="M80 180 Q66 192 68 204" />}
          {mood === "puzzled" && <Arm d="M80 180 Q66 192 68 204" />}
          {mood === "tired" && (
            <>
              <Arm d="M80 178 Q62 188 62 204" />
              <Arm d="M140 178 Q158 188 158 204" />
            </>
          )}
          {mood === "dizzy" && (
            <>
              <Arm d="M80 176 Q56 170 48 146" />
              <Arm d="M140 176 Q164 170 172 146" />
            </>
          )}
          {mood === "faint" && (
            <>
              <Arm d="M80 178 Q62 196 56 210" />
              <Arm d="M140 178 Q158 196 164 210" />
            </>
          )}

          {/* kepala */}
          <ellipse cx={110} cy={108} rx={72} ry={58} fill={SHADE} />
          <ellipse cx={103} cy={101} rx={71} ry={55} fill={SNOW} clipPath="url(#yk-head)" />
          <ellipse cx={110} cy={108} rx={72} ry={58} fill="none" stroke={INK} strokeWidth={4.5} />

          {/* pipi */}
          <ellipse cx={62} cy={133} rx={12} ry={6.5} fill="#ff9aa2" opacity={mood === "tired" ? 0.95 : 0.7} />
          <ellipse cx={158} cy={133} rx={12} ry={6.5} fill="#ff9aa2" opacity={mood === "tired" ? 0.95 : 0.7} />

          {/* wajah */}
          {mood === "happy" && (
            <>
              <Eye x={80} y={112} />
              <Eye x={140} y={112} />
              <path d="M99 130 Q110 150 121 130 Z" fill={MOUTH} stroke={INK} strokeWidth={3.6} strokeLinejoin="round" />
              <ellipse cx={110} cy={141} rx={5.5} ry={3} fill="#ff8a93" />
            </>
          )}
          {mood === "lost" && (
            <>
              <Eye x={80} y={112} lx={-3.5} ly={-2.5} />
              <Eye x={140} y={112} lx={-3.5} ly={-2.5} />
              <ellipse cx={108} cy={136} rx={4.8} ry={6} fill={MOUTH} stroke={INK} strokeWidth={3.2} />
              <Drop x={176} y={82} className="yk-drip" />
              <g className="yk-qmark">
                <text x={190} y={62} fontSize={44} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#2f6fae" stroke={INK} strokeWidth={4} paintOrder="stroke" textAnchor="middle">
                  ?
                </text>
              </g>
            </>
          )}
          {mood === "puzzled" && (
            <>
              <Eye x={80} y={112} lx={3} ly={3} />
              <Eye x={140} y={112} lx={3} ly={3} />
              <path d="M62 90 Q76 84 96 92" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <path d="M126 86 Q142 78 158 88" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <path d="M96 140 q5 -7 10 0 t10 0 t10 0" fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" />
              <Drop x={44} y={90} className="yk-drip" />
            </>
          )}
          {mood === "stern" && (
            <>
              <Eye x={80} y={114} blink={false} />
              <Eye x={140} y={114} blink={false} />
              {/* kelopak turun miring = tatapan tajam */}
              <path d="M62 92 L98 106 L98 80 L62 80 Z" fill={SNOW} />
              <path d="M158 92 L122 106 L122 80 L158 80 Z" fill={SNOW} />
              <path d="M62 91 L99 106 M158 91 L121 106" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />
              <path d="M99 140 Q110 130 121 140" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <Vein x={168} y={70} />
            </>
          )}
          {mood === "tired" && (
            <>
              <path d="M66 100 L90 112 L66 124 M154 100 L130 112 L154 124" fill="none" stroke={INK} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M97 132 Q110 126 123 132 Q121 150 110 150 Q99 150 97 132 Z" fill={MOUTH} stroke={INK} strokeWidth={3.8} strokeLinejoin="round" />
              <ellipse cx={110} cy={146} rx={6.5} ry={3.6} fill="#ff8a93" />
              <Drop x={44} y={96} className="yk-drip" />
              <Drop x={178} y={104} className="yk-drip yk-drip2" />
              <Drop x={160} y={58} className="yk-drip yk-drip3" />
            </>
          )}
          {mood === "dizzy" && (
            <>
              <Spiral x={80} y={112} />
              <Spiral x={140} y={112} />
              <path d="M94 140 q4 -8 8 0 t8 0 t8 0 t8 0" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              {/* jelaga */}
              <ellipse cx={110} cy={74} rx={26} ry={9} fill={INK} opacity={0.14} />
              <ellipse cx={150} cy={84} rx={10} ry={5} fill={INK} opacity={0.12} />
            </>
          )}
          {mood === "faint" && (
            <>
              <path d="M68 100 L92 124 M92 100 L68 124 M128 100 L152 124 M152 100 L128 124" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />
              <ellipse cx={110} cy={140} rx={7.5} ry={9.5} fill={MOUTH} stroke={INK} strokeWidth={3.6} />
              <ellipse cx={110} cy={146} rx={4.6} ry={3.4} fill="#ff8a93" />
            </>
          )}

          {/* syal */}
          <path d="M72 160 C94 180 126 180 148 160 L152 176 C128 196 92 196 68 176 Z" fill={SCARF} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M76 168 C96 184 124 184 144 168" fill="none" stroke={LEAF} strokeWidth={2.4} strokeLinecap="round" opacity={0.7} strokeDasharray="1 9" />
          <path className="yk-tail" d="M130 184 L140 210 L156 202 L150 178 Z" fill={SCARF} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />

          {/* properti & lengan depan (di atas kepala) */}
          {mood === "happy" && (
            <>
              <g transform="translate(180 152) rotate(16)" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M0 -20 V18 M0 9 H9 M0 17 H7" stroke={INK} strokeWidth={8.5} />
                <circle cy={-30} r={11} stroke={INK} strokeWidth={9.5} />
                <path d="M0 -20 V18 M0 9 H9 M0 17 H7" stroke="#f2c14e" strokeWidth={4} />
                <circle cy={-30} r={11} stroke="#f2c14e" strokeWidth={4.4} />
              </g>
              <Arm d="M140 178 Q166 178 178 156" />
            </>
          )}
          {mood === "lost" && (
            <>
              <g fill="none" strokeLinecap="round">
                <path d="M186 140 L177 158" stroke={INK} strokeWidth={10} />
                <path d="M186 140 L177 158" stroke="#9a6a3a" strokeWidth={5} />
                <circle cx={198} cy={120} r={20} fill="#bfe0f5" fillOpacity={0.85} stroke={INK} strokeWidth={5.5} />
                <path d="M187 112 Q190 103 200 101" stroke="#fff" strokeWidth={4} />
              </g>
              <Arm d="M140 178 Q168 178 179 160" />
            </>
          )}
          {mood === "puzzled" && (
            <>
              <g transform="translate(176 150) rotate(14)">
                <path d="M-18 -22 L16 -26 L22 4 L-14 10 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
                <path d="M-10 -14 L8 -16 M-9 -6 L12 -9 M-9 2 L4 0" stroke={INK} strokeWidth={2.6} strokeLinecap="round" opacity={0.5} />
                <text x={4} y={-3} fontSize={26} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#e5483f" stroke={INK} strokeWidth={3} paintOrder="stroke" textAnchor="middle">?!</text>
              </g>
              <Arm d="M140 178 Q164 180 174 160" />
            </>
          )}
          {mood === "stern" && (
            <>
              <Arm d="M80 160 Q104 176 140 198" />
              <Arm d="M140 160 Q116 176 80 198" />
            </>
          )}
        </g>

        {mood === "dizzy" && (
          <g className="yk-orbit">
            <Star x={110} y={34} s={1.05} />
            <Star x={162} y={58} s={0.75} fill="#7fe3d6" />
            <Star x={58} y={60} s={0.8} fill="#ff9aa2" />
          </g>
        )}

        {mood === "faint" && (
          <g className="yk-soul">
            <path d="M118 142 C156 132 140 104 176 80" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
            <path d="M118 142 C156 132 140 104 176 80" fill="none" stroke="#fff" strokeWidth={4.4} strokeLinecap="round" />
            <g transform="translate(40 -42)">
            <path d="M120 70 C120 44 168 44 168 70 L168 100 L158 92 L151 102 L144 92 L137 102 L130 92 L120 100 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
            <circle cx={136} cy={72} r={3.2} fill={INK} />
            <circle cx={152} cy={72} r={3.2} fill={INK} />
            <ellipse cx={144} cy={82} rx={3.4} ry={4.2} fill={INK} />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
