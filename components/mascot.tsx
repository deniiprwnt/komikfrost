/**
 * Yuki — maskot KomikFrost: rubah teal (warna primer KomikFrost) berpipi putih kehijauan, berekor lebat berujung
 * putih, bersyal teal tua. Digambar sebagai SVG murni: garis tinta tebal, warna
 * datar + satu lapis bayangan cel. Satu komponen, tujuh ekspresi — dipakai
 * oleh halaman masuk dan semua layar error.
 *
 * Tanpa hook → aman dari server maupun client component. ID <clipPath>
 * statis (`yk-*`): pasang SATU maskot per halaman.
 */
import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";

export type Mood = "happy" | "lost" | "stern" | "tired" | "dizzy" | "faint" | "puzzled";

const INK = "#0d1518";
const SNOW = "#ffffff";
const FUR = "#1a9a92";
const FUR_LIGHT = "#3cc0b4";
const FUR_SHADE = "#0b6b66";
const CREAM = "#eaf6f4";
const CREAM_SHADE = "#bfdedb";
const SOCK = "#0a2f2d";
const SCARF = "#a6ece2";
const MOUTH = "#5a1f2b";

/** Lengan mungil dengan telapak/paw bulat agar setiap pose punya tangan yang jelas. */
function Arm({ d }: { d: string }) {
  const end = d.match(/(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)$/);
  const handX = end ? Number(end[1]) : 0;
  const handY = end ? Number(end[2]) : 0;
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={17} strokeLinecap="round" />
      <path d={d} fill="none" stroke={FUR} strokeWidth={9.5} strokeLinecap="round" />
      <g transform={`translate(${handX} ${handY})`}>
        <ellipse cy={0} rx={7.2} ry={6.2} fill={FUR} stroke={INK} strokeWidth={2.8} />
        <path d="M-3 -1.2 q1.2 1.8 2.4 0 M1 -1.2 q1.2 1.8 2.4 0" fill="none" stroke="#0b6b66" strokeWidth={1.2} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Telinga rubah (runcing, ujung gelap); sisi kanan = cermin sisi kiri. `deg` memutar dari pangkalnya. */
function Ear({ deg, side }: { deg: number; side: "l" | "r" }) {
  const t = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g transform={t}>
      <g transform={`rotate(${deg} 90 80)`}>
        <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" fill={FUR} />
        <path d="M64 8 C76 12 88 22 96 34 L58 46 C56 32 58 20 64 8 Z" fill={SOCK} clipPath="url(#yk-ear)" />
        <path d="M66 80 C60 62 62 46 68 32 C86 42 98 58 100 78 Z" fill={CREAM} />
        <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" fill="none" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** Kilau empat sudut (✦). */
function Sparkle({ x, y, s = 1, fill = "#fff6c2", className, delay = 0 }: { x: number; y: number; s?: number; fill?: string; className?: string; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className={className}
        style={delay ? { animationDelay: `${delay}s` } : undefined}
        d="M0 -11 Q1.8 -1.8 11 0 Q1.8 1.8 0 11 Q-1.8 1.8 -11 0 Q-1.8 -1.8 0 -11 Z"
        fill={fill}
        stroke={INK}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Heart({ x, y, s = 1, className, delay = 0 }: { x: number; y: number; s?: number; className?: string; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className={className}
        style={delay ? { animationDelay: `${delay}s` } : undefined}
        d="M0 8 C-13 -2 -10 -13 0 -6 C10 -13 13 -2 0 8 Z"
        fill="#ff7a9a"
        stroke={INK}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
    </g>
  );
}

const CLOTH = "#0b4f4b";
const CLOTH_LIGHT = "#17807a";
const PLATE = "#cdd7de";
const ENGRAVE = "#26343c";

/** Ukuran pelat ikat kepala; semua turunan (bingkai, paku, lambang) mengikuti angka ini. */
const PLATE_BOX = { cx: 110, cy: 67, w: 70, h: 28 };

/** Pelat dan kain ikat kepala mengikuti lengkung kepala, bukan kotak tempelan. */
function Headband() {
  const { cx, cy, w, h } = PLATE_BOX;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const iw = w - 8; // bingkai dalam
  const ih = h - 8;
  const ix = x + 4;
  const iy = y + 4;
  const pad = 2.6; // ruang napas lambang di dalam bingkai
  return (
    <g>
      <g clipPath="url(#yk-head)">
        <path d="M38 69 Q110 39 182 69 L182 82 Q110 55 38 82 Z" fill={CLOTH} />
        <path d="M40 68 Q110 42 180 68 L180 73 Q110 49 40 73 Z" fill={CLOTH_LIGHT} opacity={0.62} />
        <path d="M42 75 Q110 51 178 75" fill="none" stroke="#8fdcd3" strokeWidth={1} strokeDasharray="3 2.8" opacity={0.85} />
        <path d="M38 69 Q110 39 182 69 M38 82 Q110 55 182 82" fill="none" stroke={INK} strokeWidth={3.4} />
      </g>
      {/* pelat logam */}
      <rect x={x} y={y} width={w} height={h} rx={5} fill={PLATE} stroke={INK} strokeWidth={4} />
      <path d={`M${x + 4} ${y + 3.5} H${x + w - 4}`} stroke="#fff" strokeWidth={2.600} strokeLinecap="round" opacity={0.85} />
      <rect x={ix} y={iy} width={iw} height={ih} rx={3} fill="none" stroke="#8d9ea9" strokeWidth={1.300} />
      <path d={`M${x + 5} ${y + h - 3} H${x + w - 5}`} stroke="#9aabb5" strokeWidth={1.800} strokeLinecap="round" opacity={0.9} />
      {[ix + 4.5, ix + iw - 4.5].flatMap((rx) => [iy + 5, iy + ih - 5].map((ry) => <circle key={`${rx}-${ry}`} cx={rx} cy={ry} r={1.800} fill="#74848f" />))}
      {/* lambang: otomatis muat & di-tengah-kan di bingkai dalam (di antara paku) */}
      <KonohaMark x={cx - (ih - pad * 2) * 0.62} y={iy + pad} w={(ih - pad * 2) * 1.24} h={ih - pad * 2} color={ENGRAVE} />
    </g>
  );
}

/** Simpul + ujung kain ikat kepala yang berkibar di belakang kepala (kanan). */
function HeadbandTails() {
  return (
    <g className="yk-fox-tail" style={{ transformOrigin: "166px 68px" }} stroke={INK} strokeWidth={4} strokeLinejoin="round">
      <path d="M172 61 C186 50 198 56 214 44 L214 59 C200 68 188 63 172 69 Z" fill={CLOTH} />
      <path d="M172 67 C188 72 198 84 207 100 L194 96 C186 87 180 80 172 75 Z" fill={CLOTH} />
      <path d="M180 58 C190 56 198 58 208 52" fill="none" stroke={CLOTH_LIGHT} strokeWidth={2.400} strokeLinecap="round" />
      <rect x={160} y={58} width={16} height={18} rx={4} fill={CLOTH} />
      <path d="M163 62 H173 M163 68 H173" stroke={CLOTH_LIGHT} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

/** Lambang spiral merah di dada (kotak tetap; isi otomatis pas & di-tengah-kan). */
function Crest() {
  const d = 18;
  return (
    <g>
      {/* jahitan halus membuat emblem terasa bagian dari syal */}
      <circle cx={110} cy={190} r={10.8} fill="none" stroke="#d8fff7" strokeWidth={1.1} strokeDasharray="1.8 2.4" opacity={0.8} />
      <UzumakiMark x={110 - d / 2} y={181} w={d} h={d} ink="#173c3a" red="#ed2635" />
    </g>
  );
}

/** Mata biasa (bulat hitam berkilau ala anime). `lx/ly` menggeser arah pandang. */
function Eye({ x, y, lx = 0, ly = 0, blink = true, shine = "normal" }: { x: number; y: number; lx?: number; ly?: number; blink?: boolean; shine?: "normal" | "wet" | "sparkle" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
     <g className={blink ? "yk-blink" : undefined}>
      <ellipse rx={11.500} ry={14.500} fill={INK} />
      <g transform={`translate(${lx} ${ly})`}>
        <ellipse cy={3} rx={8.200} ry={9.800} fill="#16363a" />
        {shine === "wet" ? (
          <>
            <circle cx={-4.200} cy={-4.600} r={4.400} fill="#fff" />
            <circle cx={4.200} cy={6.400} r={2.100} fill="#fff" opacity={0.9} />
            <ellipse cy={11} rx={4.200} ry={1.300} fill="#fff" opacity={0.6} />
          </>
        ) : (
          <>
            <circle cx={-4.200} cy={-4.600} r={3.600} fill="#fff" />
            <circle cx={4.200} cy={6.400} r={1.800} fill="#fff" opacity={0.9} />
          </>
        )}
        {shine === "sparkle" && <path transform="translate(5.400 -6.600) scale(.5)" d="M0 -9 Q1.5 -1.5 9 0 Q1.5 1.5 0 9 Q-1.5 1.5 -9 0 Q-1.5 -1.5 0 -9 Z" fill="#fff" />}
      </g>
     </g>
    </g>
  );
}

/** Hidung rubah: segitiga bulat kecil + kilau. `x` menggeser (mis. saat menoleh). */
function Nose({ x = 0 }: { x?: number }) {
  return (
    <g transform={`translate(${x} -3)`}>
      <path d="M102 124 Q110 120 118 124 Q115 133 110 134 Q105 133 102 124 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <ellipse cx={107.5} cy={124.4} rx={2.6} ry={1.2} fill="#fff" opacity={0.75} />
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

/** Dua ekor lebat berujung putih di sisi kanan (posisi ekor asli); yang kedua mengipas ke bawah di belakangnya. */
const TAIL_BODY = "M126 206 C154 222 202 214 214 176 C218 158 210 146 200 142 C198 166 176 186 136 184 Z";
const TAIL_TIP = "M214 176 C218 158 210 146 200 142 C199 154 196 164 190 171 C202 169 211 171 214 176 Z";
const TAIL_PIVOT = "128 196";

function FoxTail({ fill, delay = 0 }: { fill: string; delay?: number }) {
  return (
    <g className="yk-fox-tail" style={delay ? { animationDelay: `-${delay}s` } : undefined}>
      <path d={TAIL_BODY} fill={fill} />
      <path d={TAIL_TIP} fill={CREAM} />
      <path d={TAIL_BODY} fill="none" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      <path d="M190 171 C202 169 211 171 214 176" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function FoxTails() {
  return <FoxTail fill={FUR} />;
}

export function Yuki({ mood = "happy", className = "" }: { mood?: Mood; className?: string }) {
  // Siluet telinga dikunci untuk semua ekspresi. Mood hanya mengubah wajah/pose,
  // bukan anatomi kepala, agar Yuki tetap konsisten di setiap ukuran dan keadaan.
  const ears: Record<Mood, [number, number]> = {
    happy: [-5, 6],
    lost: [-5, 6],
    stern: [-5, 6],
    tired: [-5, 6],
    dizzy: [-5, 6],
    faint: [-5, 6],
    puzzled: [-5, 6],
  };
  const [eL, eR] = ears[mood];

  return (
    <svg viewBox="0 0 220 224" overflow="visible" className={`yk yk-${mood} ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="yk-head">
          <ellipse cx={110} cy={108} rx={72} ry={58} />
        </clipPath>
        <clipPath id="yk-ear">
          <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" />
        </clipPath>
      </defs>

      {/* tanah */}
      <ellipse cx={112} cy={216} rx={58} ry={6} fill={INK} opacity={0.16} />

      <g transform={mood === "faint" ? "rotate(-11 110 210)" : undefined}>
        <g className={mood === "faint" ? "yk-limp" : "yk-bob"}>
          {/* dua ekor lebat berujung putih (di belakang badan) */}
          <FoxTails />

          {/* kaki mungil berbentuk paw, dengan ujung jari yang lembut */}
          <g>
            <path d="M77 205 C77 199 82 195 89 195 C97 195 103 199 103 206 C103 212 98 216 89 216 C81 216 77 212 77 205 Z" fill={SOCK} stroke={INK} strokeWidth={4.2} strokeLinejoin="round" />
            <path d="M117 206 C117 199 123 195 131 195 C138 195 143 199 143 205 C143 212 138 216 130 216 C122 216 117 212 117 206 Z" fill={SOCK} stroke={INK} strokeWidth={4.2} strokeLinejoin="round" />
            <path d="M84 201 q2 -2 4 0 M92 200 q2 -2 4 0 M124 200 q2 -2 4 0 M132 201 q2 -2 4 0" fill="none" stroke="#2d7770" strokeWidth={1.8} strokeLinecap="round" />
          </g>

          {/* telinga */}
          <Ear deg={eL} side="l" />
          <Ear deg={eR} side="r" />

          {/* badan */}
          <path d="M78 156 C72 186 88 206 110 206 C132 206 148 186 142 156 Z" fill={FUR} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M126 170 C132 190 124 202 110 204 C128 204 144 190 140 164 Z" fill={FUR_SHADE} />
          <path d="M96 174 C94 192 100 203 110 204 C120 203 126 192 124 174 Z" fill={CREAM} />

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

          <HeadbandTails />

          {/* jambul */}
          <path d="M96 56 Q100 34 112 46 Q118 34 126 58 Z" fill={FUR} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />

          {/* rumbai pipi */}
          <g id="yk-fluff">
            <path d="M44 116 L22 124 L40 134 L28 148 L58 148 Z" fill={CREAM} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M176 116 L198 124 L180 134 L192 148 L162 148 Z" fill={CREAM} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          </g>

          {/* kepala */}
          <ellipse cx={110} cy={108} rx={72} ry={58} fill={FUR_SHADE} />
          <ellipse cx={103} cy={101} rx={71} ry={55} fill={FUR} clipPath="url(#yk-head)" />
          <ellipse cx={96} cy={84} rx={46} ry={26} fill={FUR_LIGHT} opacity={0.55} clipPath="url(#yk-head)" />
          <g clipPath="url(#yk-head)">
            <path d="M30 122 Q62 116 86 132 Q98 140 110 140 Q122 140 134 132 Q158 116 190 122 L190 180 L30 180 Z" fill={CREAM_SHADE} />
            <path d="M28 120 Q60 114 84 130 Q98 138 108 138 Q120 138 132 130 Q156 114 186 120 L186 180 L28 180 Z" fill={CREAM} />
          </g>
          <ellipse cx={110} cy={108} rx={72} ry={58} fill="none" stroke={INK} strokeWidth={4.5} />

          {/* pipi: blush dipotong mengikuti siluet kepala agar tidak keluar wajah */}
          <defs>
            {/* Batas blush mengikuti bidang pipi krem, bukan seluruh oval kepala. */}
            <clipPath id="yk-cheeks">
              <path d="M34 119 Q61 113 84 129 Q98 139 110 139 Q122 139 136 129 Q159 113 186 119 L181 157 Q110 176 39 157 Z" />
            </clipPath>
          </defs>
          <g clipPath="url(#yk-cheeks)">
            <ellipse cx={64} cy={135} rx={8.8} ry={5.1} fill="#ff9aa2" opacity={mood === "tired" ? 0.95 : 0.7} />
            <ellipse cx={156} cy={135} rx={8.8} ry={5.1} fill="#ff9aa2" opacity={mood === "tired" ? 0.95 : 0.7} />
          </g>

          {/* wajah */}
          {mood === "happy" && (
            <>
              <Eye x={80} y={112} shine="sparkle" />
              <Eye x={140} y={112} shine="sparkle" />
              <Nose />
              <path d="M100 141 Q110 162 120 141 Z" fill={MOUTH} stroke={INK} strokeWidth={3.6} strokeLinejoin="round" />
              <ellipse cx={110} cy={154} rx={5.5} ry={3} fill="#ff8a93" />
              <path d="M102 142.500 L106.500 142.500 L104.200 148 Z M113.500 142.500 L118 142.500 L115.800 148 Z" fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
              <Sparkle x={26} y={78} s={1} className="yk-twinkle" />
              <Sparkle x={196} y={36} s={0.75} fill="#a6ece2" className="yk-twinkle" delay={0.6} />
              <Heart x={30} y={112} s={0.75} className="yk-twinkle" delay={1.1} />
            </>
          )}
          {mood === "lost" && (
            <>
              <Eye x={80} y={112} lx={-3.5} ly={-2.5} shine="wet" />
              <Eye x={140} y={112} lx={-3.5} ly={-2.5} shine="wet" />
              <path d="M64 134 q-5 7 0 11 q5 -4 0 -11 Z M156 134 q-5 7 0 11 q5 -4 0 -11 Z" fill="#bfe3f6" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
              <Nose x={-2} />
              <ellipse cx={108} cy={146} rx={4.8} ry={6} fill={MOUTH} stroke={INK} strokeWidth={3.2} />
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
              <Eye x={80} y={112} lx={3} ly={3} shine="wet" />
              <Eye x={140} y={112} lx={3} ly={3} shine="wet" />
              <path d="M62 92 Q76 87 96 94" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <path d="M126 90 Q142 80 158 90" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <Nose />
              <path d="M96 149 q5 -7 10 0 t10 0 t10 0" fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" />
              <Drop x={44} y={90} className="yk-drip" />
              <text x={30} y={62} fontSize={30} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#2f6fae" stroke={INK} strokeWidth={3.4} paintOrder="stroke" textAnchor="middle" transform="rotate(-14 30 62)">?</text>
            </>
          )}
          {mood === "stern" && (
            <>
              <Eye x={80} y={114} blink={false} />
              <Eye x={140} y={114} blink={false} />
              {/* kelopak turun miring = tatapan tajam */}
              <path d="M62 92 L98 106 L98 80 L62 80 Z" fill="#2eaea5" />
              <path d="M158 92 L122 106 L122 80 L158 80 Z" fill="#2eaea5" />
              <path d="M62 91 L99 106 M158 91 L121 106" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />
              <Nose />
              <path d="M99 150 Q110 140 121 150" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <path d="M104.500 146.500 L108 146.500 L106.200 152 Z" fill="#fff" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
              <Vein x={44} y={96} />
            </>
          )}
          {mood === "tired" && (
            <>
              <path d="M66 100 L90 112 L66 124 M154 100 L130 112 L154 124" fill="none" stroke={INK} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
              <Nose />
              <path d="M98 143 Q110 137 122 143 Q120 158 110 158 Q100 158 98 143 Z" fill={MOUTH} stroke={INK} strokeWidth={3.8} strokeLinejoin="round" />
              <ellipse cx={110} cy={154} rx={6.5} ry={3.6} fill="#ff8a93" />
              <Drop x={44} y={96} className="yk-drip" />
              <Drop x={178} y={104} className="yk-drip yk-drip2" />
              <Drop x={160} y={58} className="yk-drip yk-drip3" />
              <g className="yk-soul">
                <circle cx={152} cy={44} r={4.5} fill="#fff" stroke={INK} strokeWidth={2.6} />
                <circle cx={163} cy={32} r={6.5} fill="#fff" stroke={INK} strokeWidth={2.8} />
                <circle cx={177} cy={18} r={9} fill="#fff" stroke={INK} strokeWidth={3} />
              </g>
            </>
          )}
          {mood === "dizzy" && (
            <>
              <Spiral x={84} y={109} />
              <Spiral x={136} y={109} />
              <Nose />
              {/* mulut pusing: bentuk terbuka kecil dan simetris, bukan zig-zag */}
              <path d="M99 149 q5 -7 10 0 t10 0 t10 0" fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
              {/* jelaga */}
              <ellipse cx={110} cy={74} rx={26} ry={9} fill={INK} opacity={0.14} />
              <ellipse cx={150} cy={84} rx={10} ry={5} fill={INK} opacity={0.12} />
            </>
          )}
          {mood === "faint" && (
            <>
              <path d="M68 100 L92 124 M92 100 L68 124 M128 100 L152 124 M152 100 L128 124" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />
              <Nose />
              <g className="yk-soul">
                <ellipse cx={110} cy={26} rx={28} ry={8} fill="none" stroke={INK} strokeWidth={9} />
                <ellipse cx={110} cy={26} rx={28} ry={8} fill="none" stroke="#f2c14e" strokeWidth={4.600} />
              </g>
              <ellipse cx={110} cy={150} rx={7.5} ry={9.5} fill={MOUTH} stroke={INK} strokeWidth={3.6} />
              <ellipse cx={110} cy={156} rx={4.6} ry={3.4} fill="#ff8a93" />
            </>
          )}

          {/* ikat kepala ninja */}
          <Headband />

          {/* pakaian ninja baru: rompi berlapis, pelindung bahu, dan jahitan tegas */}
          <g stroke={INK} strokeLinejoin="round">
            <path d="M67 158 Q78 154 88 162 L83 193 Q78 204 69 201 L59 184 Z"
              fill="#123b3b" strokeWidth={3.8} />
            <path d="M153 158 Q142 154 132 162 L137 193 Q142 204 151 201 L161 184 Z"
              fill="#123b3b" strokeWidth={3.8} />
            <path d="M65 160 Q73 153 84 160 L80 171 Q70 174 62 168 Z"
              fill="#17807a" strokeWidth={3.2} />
            <path d="M155 160 Q147 153 136 160 L140 171 Q150 174 158 168 Z"
              fill="#17807a" strokeWidth={3.2} />
            <path d="M67 163 Q73 159 79 162 M141 162 Q147 159 153 163"
              fill="none" stroke="#8fe0d6" strokeWidth={1.8} strokeLinecap="round" />
            <path d="M70 178 L75 194 M150 178 L145 194"
              fill="none" stroke="#56b9ae" strokeWidth={1.8} strokeDasharray="2 3" />
            <circle cx="73" cy="183" r="2" fill="#d8fff7" strokeWidth={1} />
            <circle cx="147" cy="183" r="2" fill="#d8fff7" strokeWidth={1} />
          </g>

          {/* syal: kerah berlapis, panel dada, jahitan, dan ujung kain */}
          <g>
            {/* lapisan belakang membentuk volume di bawah dagu */}
            <path d="M66 158 Q110 181 154 158 L160 178 Q110 207 60 178 Z"
              fill="#0b6b66" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M73 163 Q110 183 147 163 L150 174 Q110 194 70 174 Z"
              fill="#17807a" stroke="#063f3c" strokeWidth={2.2} strokeLinejoin="round" />
            <path d="M78 166 Q110 183 142 166" fill="none" stroke="#65cfc3" strokeWidth={2.2} strokeLinecap="round" />
            {/* panel depan dengan tepi miring seperti kain yang dilipat */}
            <path d="M66 174 Q110 195 154 174 L148 207 Q110 219 72 207 Z"
              fill={SCARF} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M73 181 Q110 199 147 181 L144 190 Q110 207 76 190 Z"
              fill="#d9fff6" opacity={0.72} />
            <path d="M78 198 Q110 211 142 198" fill="none" stroke="#4baea4" strokeWidth={2.1} strokeLinecap="round" />
            {/* jahitan kecil pada kedua sisi panel */}
            {[84, 94, 104, 116, 126, 136].map((x) => (
              <circle key={x} cx={x} cy={x < 110 ? 190 + (x - 84) * 0.42 : 198 - (x - 116) * 0.42}
                r={1.45} fill="#147d76" opacity={0.82} />
            ))}
            {/* sabuk kain kecil di bawah panel, memberi siluet seragam ninja */}
            <path d="M82 205 Q110 215 138 205 L136 213 Q110 222 84 213 Z"
              fill="#0b4f4b" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
            <path d="M91 211 Q110 216 129 211" fill="none" stroke="#70d4c8" strokeWidth={1.5} strokeLinecap="round" />
            {/* ujung syal jatuh ke sisi kanan */}
            <path className="yk-tail" d="M132 184 L142 216 Q145 220 151 215 L165 205 L151 177 Z"
              fill="#9be4d9" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          </g>
          <Crest />

          {/* properti & lengan depan (di atas kepala) */}
          {mood === "happy" && (
            <>
              <g transform="translate(186 134) rotate(12)">
                <rect x={-19} y={-25} width={38} height={50} rx={4} fill="#eaf6f4" stroke={INK} strokeWidth={4} />
                <rect x={-19} y={-25} width={34} height={50} rx={4} fill="#0b6b66" stroke={INK} strokeWidth={4} />
                <path d="M-11 -13 H-5 L-8 0 L-5 13 H-11 Z M1 -13 H9 V13 H1 L-3 0 Z" fill="#fff" />
                <Star x={12} y={-23} s={0.95} />
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
            <Star x={34} y={88} s={0.68} fill="#ff9aa2" />
            <Star x={184} y={88} s={0.68} fill="#7fe3d6" />
            <Star x={110} y={34} s={0.72} />
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
