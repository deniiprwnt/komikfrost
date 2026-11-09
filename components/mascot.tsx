/**
 * Yuki — maskot KomikFrost: rubah teal (warna primer KomikFrost) berpipi putih kehijauan, berjubah Hokage putih bermotif api merah, berekor lebat berujung
 * putih, bersyal teal tua. Digambar sebagai SVG murni: garis tinta tebal, warna
 * datar + satu lapis bayangan cel. Satu komponen, tujuh ekspresi — dipakai
 * oleh halaman masuk dan semua layar error.
 *
 * Tanpa hook → aman dari server maupun client component. ID <clipPath>
 * statis (`yk-*`): pasang SATU maskot per halaman.
 */
import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";

export type Mood = "happy" | "lost" | "stern" | "tired" | "dizzy" | "faint" | "puzzled" | "guard";

const INK = "#0d1518";
const SNOW = "#ffffff";
const FUR = "#1a9a92";
const FUR_LIGHT = "#3cc0b4";
const FUR_SHADE = "#0b6b66";
const CREAM = "#eaf6f4";
const CREAM_SHADE = "#bfdedb";
const SOCK = "#0a2f2d";
const SCARF = "#a6ece2";
const SCARF_BLUE = "#0d4bb9";
const NAVY = "#2b3570";
const NAVY_LIGHT = "#3d4a8f";
const VEST = "#7c9170";
const VEST_DARK = "#586d50";
const MOUTH = "#5a1f2b";

/** Lengan mungil dengan telapak/paw bulat agar setiap pose punya tangan yang jelas. */
function Arm({ d, anim }: { d: string; anim?: string }) {
  // Arah lengan dari dua titik terakhir path → telapak diputar searah lengan (menyatu, bukan tempelan).
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const [cx, cy, ex, ey] = n.slice(-4);
  const deg = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
  return (
    <g className={anim} style={anim ? { transformOrigin: `${n[0]}px ${n[1]}px` } : undefined}>
      {/* lengan jubah ala Akatsuki: lengan baju lebar berwarna putih, ujungnya melebar dengan pita api merah */}
      <path d={d} fill="none" stroke={INK} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={HAORI} strokeWidth={18.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={HAORI_SHADE} strokeWidth={5} strokeLinecap="round" opacity={0.85} transform="translate(1.6 3)" />
      <path d={d} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.9} transform="translate(-3.4 -3.4)" />
      <g transform={`translate(${ex} ${ey}) rotate(${deg})`}>
        {/* ujung lengan melebar + pita api dekoratif merah */}
        <g transform="translate(-5.5 0)">
        <path d="M-21 -10.4 L-3 -13.6 Q1.2 0 -3 13.6 L-21 10.4 Z" fill={HAORI} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
        <path d="M-9 -12.2 L-3 -13.6 Q1.2 0 -3 13.6 L-9 12.2 Q-6.6 0 -9 -12.2 Z" fill={FLAME} />
        <path d="M-9 -8 q-2 2.4 0 4.8 M-9 -1.6 q-2.6 3 0 6 M-9 5.2 q-2 2.4 0 4.8" fill="none" stroke={HAORI} strokeWidth={1.8} strokeLinecap="round" />
        <path d="M-3 -13.6 Q1.2 0 -3 13.6" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
        <path d="M-19 -6 L-10 -7.4" stroke={HAORI_LINE} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
        </g>
        {/* telapak: siluet menyatu (telapak + tiga jari), garis tepi hanya di luar */}
        <g fill={INK} stroke={INK} strokeWidth={5.6} strokeLinejoin="round">
          <ellipse cx={7} cy={0} rx={11} ry={9.4} />
          <circle cx={17.6} cy={-5.6} r={4.6} />
          <circle cx={20} cy={0} r={4.8} />
          <circle cx={17.6} cy={5.6} r={4.6} />
        </g>
        <g fill={FUR}>
          <ellipse cx={7} cy={0} rx={11} ry={9.4} />
          <circle cx={17.6} cy={-5.6} r={4.6} />
          <circle cx={20} cy={0} r={4.8} />
          <circle cx={17.6} cy={5.6} r={4.6} />
        </g>
        {/* bayangan sel di sisi bawah + kilau atas */}
        <path d="M0 6.4 C7 9.6 15 9.2 20.6 5 C19.4 9.2 14 11 8 10.6 C4 10.2 1.4 8.6 0 6.4 Z" fill={FUR_SHADE} opacity={0.7} />
        <path d="M0.5 -7 C5 -8.8 10 -8.8 14 -8" fill="none" stroke={FUR_LIGHT} strokeWidth={2} strokeLinecap="round" opacity={0.9} />
        {/* celah antar jari */}
        <path d="M13.8 -2.9 L18.6 -2.9 M13.8 2.9 L18.6 2.9" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        {/* bantalan telapak */}
        <path d="M3.6 0 C3.6 -3 6 -4 8 -3.2 C10.4 -2.4 10.4 2.4 8 3.2 C6 4 3.6 3 3.6 0 Z" fill={CREAM_SHADE} opacity={0.95} />
      </g>
    </g>
  );
}

/** Kelompok yang berayun dari bahu: lengan + benda yang dipegang bergerak bersama. */
function Hold({ at, anim, children }: { at: [number, number]; anim: string; children: React.ReactNode }) {
  return (
    <g className={anim} style={{ transformOrigin: `${at[0]}px ${at[1]}px` }}>
      {children}
    </g>
  );
}

/** Telinga rubah (runcing, ujung gelap); sisi kanan = cermin sisi kiri. `deg` memutar dari pangkalnya. */
function Ear({ deg, side }: { deg: number; side: "l" | "r" }) {
  const t = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g className="yk-follow">
    <g transform={t}>
      <g transform={`rotate(${deg} 90 80)`}>
        <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" fill={FUR} />
        <path d="M64 8 C76 12 88 22 96 34 L58 46 C56 32 58 20 64 8 Z" fill={SOCK} clipPath="url(#yk-ear)" />
        <path d="M66 80 C60 62 62 46 68 32 C86 42 98 58 100 78 Z" fill={CREAM} />
        <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" fill="none" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      </g>
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

/** Kain ikat kepala shinobi Konoha: biru tua (navy), pelat baja sikat berlambang daun. */
const CLOTH = "#0d4bb9";
const CLOTH_LIGHT = "#2f6fe0";
const CLOTH_DARK = "#0a3590";
const PLATE = "#cdd7de";
const ENGRAVE = "#26343c";

/** Ukuran pelat ikat kepala; semua turunan (tutup ujung, paku, lambang) mengikuti angka ini. */
const PLATE_BOX = { cx: 110, cy: 63, w: 78, h: 30 };

/**
 * Ikat kepala ala aslinya: kain navy melingkar mengikuti lengkung dahi (tepi berjahit),
 * pelat baja persegi panjang yang lebih tinggi dari kain, dua tutup ujung berpaku keling
 * tempat kain masuk, panel tengah cekung berlambang daun. Statis: tanpa kilau/animasi.
 */
function Headband() {
  const { cx, cy, w, h } = PLATE_BOX;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const cap = 7; // tutup ujung pelat
  const ix = x + cap;
  const iw = w - cap * 2;
  const iy = y + 4;
  const ih = h - 8;
  const pad = 2.4;
  const rivets = [
    [ix + 5, iy + 4.500],
    [ix + 5, iy + ih - 4.500],
    [ix + iw - 5, iy + 4.500],
    [ix + iw - 5, iy + ih - 4.500],
  ];
  return (
    <g>
      {/* kain melingkar dahi */}
      <g clipPath="url(#yk-head)">
        <path d="M36 70 Q110 42 184 70 L184 85 Q110 57 36 85 Z" fill={CLOTH} />
        <path d="M36 70 Q110 42 184 70 L184 75 Q110 47 36 75 Z" fill={CLOTH_LIGHT} opacity={0.7} />
        <path d="M36 80 Q110 52 184 80 L184 85 Q110 57 36 85 Z" fill={CLOTH_DARK} opacity={0.55} />
        <path d="M36 70 Q110 42 184 70 M36 85 Q110 57 184 85" fill="none" stroke={INK} strokeWidth={3.600} />
      </g>
      {/* bayangan pelat di atas kain */}
      <rect x={x + 1.500} y={y + 3.500} width={w} height={h} rx={6} fill={INK} opacity={0.28} />
      {/* badan pelat: baja sikat */}
      <rect x={x} y={y} width={w} height={h} rx={6} fill="url(#yk-steel)" stroke={INK} strokeWidth={4} />
      {/* panel tengah cekung */}
      <rect x={ix + 1} y={iy} width={iw - 2} height={ih} rx={3} fill="#e3eaef" stroke="#8d9ea9" strokeWidth={1.300} />
      <path d={`M${ix + 3.500} ${iy + 1.700} H${ix + iw - 3.500}`} stroke="#fff" strokeWidth={1.600} strokeLinecap="round" opacity={0.9} />
      {/* paku keling */}
      {rivets.map(([rx, ry]) => (
        <g key={`${rx}-${ry}`}>
          <circle cx={rx} cy={ry} r={1.900} fill="#74848f" stroke={INK} strokeWidth={0.800} />
        </g>
      ))}
      {/* lambang daun Konoha */}
      <KonohaMark x={cx - (ih - pad * 2) * 0.62} y={iy + pad} w={(ih - pad * 2) * 1.24} h={ih - pad * 2} color={ENGRAVE} />
    </g>
  );
}

/** Kerah syal biru berbentuk V (lambang spiral di tengah), di atas rompi & di bawah bahu jubah. */
function Collar() {
  const d = 17;
  return (
    <g>
      <path d="M64 158 Q110 181 156 158 L159 171 L110 198 L61 171 Z" fill={SCARF_BLUE} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      <UzumakiMark x={110 - d / 2} y={174.500} w={d} h={d} ink={INK} red="#e22a2c" />
    </g>
  );
}

/** Jubah Hokage Keempat (haori Yondaime): PUTIH, dengan motif api MERAH di tepi bawah — murni dekorasi (datar, tidak menyala/berkelip). */
const HAORI = "#f6f3ee";
const HAORI_LIGHT = "#ffffff";
const HAORI_SHADE = "#ddd7cc";
const HAORI_LINE = "#b9b1a4";
const FLAME = "#d6262b"; // merah Hokage
const FLAME_IN = "#8f1519";

/** Motif lidah api dekoratif di tepi bawah jubah: datar, tanpa animasi, bukan api sungguhan. */
function FlameRow({ xs, by, hs = [24, 17], w = 9 }: { xs: number[]; by: number; hs?: number[]; w?: number; delay?: number }) {
  return (
    <>
      {xs.map((cx, i) => {
        const h = hs[i % hs.length];
        return (
          <g key={cx}>
            <path d={`M${cx - w} ${by} C${cx - w} ${by - h * 0.45} ${cx - w * 0.2} ${by - h * 0.55} ${cx + w * 0.1} ${by - h} C${cx + w * 0.1} ${by - h * 0.5} ${cx + w} ${by - h * 0.5} ${cx + w} ${by} Z`} fill={FLAME} />
            <path d={`M${cx - w * 0.4} ${by} C${cx - w * 0.4} ${by - h * 0.3} ${cx - w * 0.1} ${by - h * 0.45} ${cx + w * 0.1} ${by - h * 0.7} C${cx + w * 0.2} ${by - h * 0.4} ${cx + w * 0.5} ${by - h * 0.3} ${cx + w * 0.5} ${by} Z`} fill={FLAME_IN} opacity={0.5} />
          </g>
        );
      })}
    </>
  );
}

const WING_OUTER = "M68 160 C55 178 44 206 45 238 Q55 245 66 241 Q78 237 90 241";
const PANEL_L = "M62 157 Q75 150 88 160 C93 190 79 212 85 235 Q76 243 66 239.500 Q56 236 48 241.500 C40 224 45 200 46 182 C47 170 55 161 62 157 Z";
const PANEL_R = "M158 157 Q145 150 132 160 C127 190 141 212 135 235 Q144 243 154 239.500 Q164 236 172 241.500 C180 224 175 200 174 182 C173 170 165 161 158 157 Z";

function CapeWing({ side }: { side: "l" | "r" }) {
  const xs = [55, 68, 81, 94, 106];
  const outer = WING_OUTER;
  const mirror = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g className={side === "l" ? "yk-wing yk-wing-l" : "yk-wing yk-wing-r"}>
      <g transform={mirror}>
        <path d={`${outer} L100 166 Z`} fill={HAORI} />
        <g clipPath="url(#yk-wing-clip)">
          <path d="M80 166 C66 180 56 206 52 236 Q66 234 80 237 Q82 196 94 172 Z" fill={HAORI_SHADE} />
          <path d="M68 176 Q58 200 54 226 M88 182 Q82 204 80 228" fill="none" stroke={HAORI_LINE} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        </g>
        {/* motif api merah dekoratif di tepi bawah */}
        <g clipPath="url(#yk-wing-clip)">
          <path d="M36 234.500 L112 234.500 L112 252 L36 252 Z" fill={FLAME} />
          <FlameRow xs={xs} by={235} hs={[8, 6]} w={6.5} />
        </g>
        <path d={outer} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** Punggung jubah: menyambung dari bahu sampai tepi bawah (sejajar hem sayap), supaya celah antar kaki tidak kosong. */
const BACK_PANEL = "M70 160 L150 160 L151 237 Q140 243 130 239.500 Q120 236 110 241 Q100 246 90 239.500 Q80 236 69 237 Z";
const BACK_HEM = "M151 237 Q140 243 130 239.500 Q120 236 110 241 Q100 246 90 239.500 Q80 236 69 237";

function Cape() {
  return (
    <g>
      <path d={BACK_PANEL} fill={HAORI_SHADE} />
      <path d="M99 170 Q96 205 98 230 M121 170 Q124 205 122 230" fill="none" stroke={HAORI_LINE} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
      {/* motif api merah dekoratif di hem punggung, sama dengan sayap */}
      <g clipPath="url(#yk-back-clip)">
        <path d="M66 234.500 L154 234.500 L154 252 L66 252 Z" fill={FLAME} />
        <FlameRow xs={[100, 110, 120]} by={235} hs={[8, 6]} w={6} />
      </g>
      <path d={BACK_HEM} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <CapeWing side="l" />
      <CapeWing side="r" />
    </g>
  );
}

/** Mata biasa (bulat hitam berkilau ala anime). `lx/ly` menggeser arah pandang. */
function Eye({ x, y, lx = 0, ly = 0, blink = true, shine = "normal" }: { x: number; y: number; lx?: number; ly?: number; blink?: boolean; shine?: "normal" | "wet" | "sparkle" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
     <g className={blink ? "yk-blink" : undefined}>
      <ellipse rx={11.500} ry={14.500} fill={INK} />
      <g className="yk-look">
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
      <g className="yk-vein">
        <path d={p} stroke={INK} strokeWidth={7} />
        <path d={p} stroke="#e5483f" strokeWidth={3.4} />
      </g>
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

/** Kaki: celana biru berperban + telapak berjari tiga. Digambar DI BELAKANG badan agar jubah menutup pangkalnya. */
function Legs() {
  return (
    <g>
      {[93.500, 126.500].map((x, i) => (
        <g key={x} transform={`translate(${x} 238) scale(${i ? "-0.9" : "0.9"} 1)`}>
          <g className={i ? "yk-foot yk-foot-r" : "yk-foot"}>
            {/* celana: tabung pendek yang menyambung ke bawah jubah */}
            <path d="M-11 -24 H11 L12.500 0.500 Q0 5 -12.500 0.500 Z" fill={NAVY} stroke={INK} strokeWidth={3.600} strokeLinejoin="round" />
            <path d="M-6 -22 V-4" stroke={NAVY_LIGHT} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
            <path d="M-12 -2.500 Q0 1.500 12 -2.500" fill="none" stroke="#fff" strokeWidth={2.400} strokeLinecap="round" />
            <path d="M-12.200 -7.500 Q0 -4 12.200 -7.500" fill="none" stroke="#fff" strokeWidth={2.400} strokeLinecap="round" opacity={0.9} />
            {/* sepatu sandal shinobi: biru tua, ujung terbelah ala tabi, sol gelap */}
            <path d="M-13.500 1.500 Q-15.500 11 -16 18.500 Q-16.500 25.500 -8 26 L8 26 Q16.500 25.500 16 18.500 Q15.500 11 13.500 1.500 Z" fill={NAVY} stroke={INK} strokeWidth={3.600} strokeLinejoin="round" />
            <path d="M-14.600 15.500 Q0 10 14.600 15.500 Q16 18 15.600 20.500 Q0 24 -15.600 20.500 Q-16 18 -14.600 15.500 Z" fill={NAVY_LIGHT} />
            <path d="M-15.800 20.600 Q0 24.400 15.800 20.600 Q16.800 26 8 26.500 L-8 26.500 Q-16.800 26 -15.800 20.600 Z" fill="#171d47" />
            <path d="M-16 20.800 Q0 24.600 16 20.800" fill="none" stroke={INK} strokeWidth={1.800} strokeLinecap="round" />
            <path d="M0 14.800 V23" stroke={INK} strokeWidth={1.800} strokeLinecap="round" />
            <path d="M-12 4.500 Q0 8.500 12 4.500" fill="none" stroke="#fff" strokeWidth={2.200} strokeLinecap="round" opacity={0.9} />
            <path d="M-11 12.500 Q-6 10.500 -2 11.500" fill="none" stroke="#fff" strokeWidth={1.600} strokeLinecap="round" opacity={0.45} />
          </g>
        </g>
      ))}
    </g>
  );
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
    guard: [-5, 6],
  };
  const [eL, eR] = ears[mood];

  return (
    <svg key={mood} viewBox="0 0 220 266" preserveAspectRatio="xMidYMax meet" overflow="visible" style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%" }} className={`yk yk-${mood} ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="yk-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f7f9" />
          <stop offset="0.5" stopColor="#cdd7de" />
          <stop offset="1" stopColor="#9fb0bb" />
        </linearGradient>
        <clipPath id="yk-head">
          <ellipse cx={110} cy={108} rx={72} ry={58} />
        </clipPath>
        <clipPath id="yk-wing-clip">
          <path d={`${WING_OUTER} L100 166 Z`} />
        </clipPath>
        <clipPath id="yk-back-clip"><path d={BACK_PANEL} /></clipPath>
        <clipPath id="yk-panel-l"><path d={PANEL_L} /></clipPath>
        <clipPath id="yk-panel-r"><path d={PANEL_R} /></clipPath>
        <clipPath id="yk-ear">
          <path d="M54 88 C46 60 52 32 64 8 C94 20 112 48 116 84 Z" />
        </clipPath>
      </defs>

      {/* tanah */}
      <ellipse className="yk-shadow" cx={110} cy={262} rx={60} ry={5} fill={INK} opacity={0.16} />

      <g transform={mood === "faint" ? "rotate(-11 110 210)" : undefined}>
        <g className={mood === "faint" ? "yk-limp" : "yk-bob"}>
          {/* dua ekor lebat berujung putih (di belakang badan) */}
          <FoxTails />

          {/* jubah di belakang badan */}
          <Cape />

          {/* telinga */}
          <Ear deg={eL} side="l" />
          <Ear deg={eR} side="r" />

          {/* kaki (di belakang badan) */}
          <Legs />

          {/* badan */}
          <path d="M78 156 C72 186 88 206 110 206 C132 206 148 186 142 156 Z" fill={FUR} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M126 170 C132 190 124 202 110 204 C128 204 144 190 140 164 Z" fill={FUR_SHADE} />
          <path d="M96 174 C94 192 100 203 110 204 C120 203 126 192 124 174 Z" fill={CREAM} />

          {/* lengan belakang (pose) */}
          {(mood === "happy" || mood === "guard") && <Arm d="M70 174 Q50 172 38 150" anim="yk-wave" />}
          {mood === "lost" && <Arm d="M70 176 Q62 190 63 204" anim="yk-sway-l" />}
          {mood === "puzzled" && <Arm d="M70 176 Q62 190 63 204" anim="yk-sway-l" />}
          {mood === "tired" && (
            <>
              <Arm d="M70 176 Q60 190 61 204" anim="yk-sway-l" />
              <Arm d="M150 176 Q160 190 159 204" anim="yk-sway-r" />
            </>
          )}
          {mood === "dizzy" && (
            <>
              <Arm d="M70 174 Q54 170 46 146" anim="yk-flail-l" />
              <Arm d="M150 174 Q166 170 174 146" anim="yk-flail-r" />
            </>
          )}
          {mood === "faint" && (
            <>
              <Arm d="M70 176 Q60 196 56 210" anim="yk-sway-l" />
              <Arm d="M150 176 Q160 196 164 210" anim="yk-sway-r" />
            </>
          )}

          <g className="yk-follow">
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
              <path d="M102 142.500 L106.500 142.500 L104.200 148 Z M113.500 142.500 L118 142.500 L115.800 148 Z" fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
              <Sparkle x={26} y={78} s={1} className="yk-twinkle" />
              <Sparkle x={196} y={36} s={0.75} fill="#a6ece2" className="yk-twinkle" delay={0.6} />
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

          {mood === "guard" && (
            <>
              <Eye x={80} y={112} lx={2} ly={-1} />
              <Eye x={140} y={112} lx={2} ly={-1} />
              <path d="M62 96 Q78 91 96 97" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <path d="M126 88 Q142 75 158 86" fill="none" stroke={INK} strokeWidth={4.4} strokeLinecap="round" />
              <Nose />
              <path d="M99 149 Q110 155 121 147" fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" />
              <g className="yk-qmark">
                <text x={192} y={64} fontSize={42} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#8f7ee6" stroke={INK} strokeWidth={4} paintOrder="stroke" textAnchor="middle">
                  ?
                </text>
              </g>
            </>
          )}

          {/* ikat kepala ninja */}
          <Headband />
          </g>

          {/* rompi, sabuk, lalu kerah syal biru berbentuk V di atasnya */}
          <g>
            {/* rompi flak Konoha: hijau abu-abu, kantong dada, ritsleting */}
            <path d="M66 174 Q110 195 154 174 L148 207 Q110 219 72 207 Z" fill={VEST} stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
            <path d="M72 180 Q110 198 148 180 L146 186 Q110 203 74 186 Z" fill="#9db38f" opacity={0.55} />
            {[[88, 189], [122, 189]].map(([x, y]) => (
              <g key={x}>
                <rect x={x} y={y} width={10} height={11} rx={2} fill={VEST_DARK} stroke={INK} strokeWidth={2.2} />
                <path d={`M${x + 1.2} ${y + 4} H${x + 8.8}`} stroke="#9db38f" strokeWidth={1.2} strokeLinecap="round" />
                <circle cx={x + 5} cy={y + 7.5} r={1.2} fill="#c9d6bf" />
              </g>
            ))}
            <path d="M110 180 V183 M110 198 V206" stroke="#3c4b36" strokeWidth={2} strokeLinecap="round" />
            {/* sabuk kain kecil di bawah panel, memberi siluet seragam ninja */}
            <path d="M82 205 Q110 215 138 205 L136 213 Q110 222 84 213 Z"
              fill={NAVY} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
            <path d="M91 211 Q110 216 129 211" fill="none" stroke={NAVY_LIGHT} strokeWidth={1.5} strokeLinecap="round" />
            <rect x={103} y={208} width={14} height={9} rx={2.5} fill={PLATE} stroke={INK} strokeWidth={2.4} />
            <rect x={107} y={210.500} width={6} height={4} rx={1} fill="none" stroke="#74848f" strokeWidth={1.2} />
          </g>

          <Collar />

          {/* haori Yondaime: dua panel depan terbuka dari bahu sampai bawah, api di ujung */}
          <g stroke={INK} strokeLinejoin="round">
            <path d={PANEL_L} fill={HAORI} strokeWidth={3.8} />
            <path d={PANEL_R} fill={HAORI} strokeWidth={3.8} />
            <path d="M63 159 Q74 152 88 159 L84 171 Q72 175 60 168 Z" fill={HAORI_LIGHT} strokeWidth={3.2} />
            <path d="M157 159 Q146 152 132 159 L136 171 Q148 175 160 168 Z" fill={HAORI_LIGHT} strokeWidth={3.2} />
            <path d="M66 162 Q74 157 82 161 M138 161 Q146 157 154 162" fill="none" stroke="#cfc8bc" strokeWidth={1.8} strokeLinecap="round" />
            <path d="M63 167 Q73 173 85 168 M157 167 Q147 173 135 168" fill="none" stroke={HAORI_LINE} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
          </g>
          <g clipPath="url(#yk-panel-l)"><path d="M40 234.500 L88 234.500 L88 250 L40 250 Z" fill={FLAME} /><FlameRow xs={[55.500, 65.500, 75.500]} by={235} hs={[9, 13, 8]} w={5.600} /></g>
          <g clipPath="url(#yk-panel-r)"><path d="M132 234.500 L180 234.500 L180 250 L132 250 Z" fill={FLAME} /><FlameRow xs={[144.500, 154.500, 164.500]} by={235} hs={[8, 13, 9]} w={5.600} /></g>


          {/* properti & lengan depan (di atas kepala) */}
          {mood === "happy" && (
            <Hold at={[152, 174]} anim="yk-hold">
              <g transform="translate(198 134) rotate(12)">
                <rect x={-19} y={-25} width={38} height={50} rx={4} fill="#eaf6f4" stroke={INK} strokeWidth={4} />
                <rect x={-19} y={-25} width={34} height={50} rx={4} fill="#0b6b66" stroke={INK} strokeWidth={4} />
                <path d="M-11 -13 H-5 L-8 0 L-5 13 H-11 Z M1 -13 H9 V13 H1 L-3 0 Z" fill="#fff" />
                <Star x={12} y={-23} s={0.95} />
              </g>
              <Arm d="M152 174 Q174 174 190 156" />
            </Hold>
          )}
          {mood === "lost" && (
            <g className="yk-aim"><Hold at={[152, 174]} anim="yk-search">
              <g fill="none" strokeLinecap="round" transform="translate(11 0)">
                <path d="M186 140 L177 158" stroke={INK} strokeWidth={10} />
                <path d="M186 140 L177 158" stroke="#9a6a3a" strokeWidth={5} />
                <circle cx={198} cy={120} r={20} fill="#bfe0f5" fillOpacity={0.85} stroke={INK} strokeWidth={5.5} />
                <g transform="translate(198 120)"><g className="yk-glint"><path d="M-9 -6 Q-6.5 -11.5 0 -12.5" stroke="#fff" strokeWidth={3.5} /></g></g>
              </g>
              <Arm d="M152 174 Q174 174 190 160" />
            </Hold></g>
          )}
          {mood === "puzzled" && (
            <Hold at={[152, 174]} anim="yk-hold">
              <g transform="translate(192 132) rotate(14)">
                <path d="M-18 -22 L16 -26 L22 4 L-14 10 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
                <path d="M-10 -14 L8 -16 M-9 -6 L12 -9 M-9 2 L4 0" stroke={INK} strokeWidth={2.6} strokeLinecap="round" opacity={0.5} />
                <text x={4} y={-3} fontSize={26} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#e5483f" stroke={INK} strokeWidth={3} paintOrder="stroke" textAnchor="middle">?!</text>
              </g>
              <Arm d="M152 174 Q174 176 188 160" />
            </Hold>
          )}
          {mood === "guard" && (
            <Hold at={[152, 174]} anim="yk-hold">
              <g transform="translate(196 132) rotate(10)">
                <g className="yk-card">
                  <rect x={-23} y={-16} width={46} height={32} rx={5} fill="#fff" stroke={INK} strokeWidth={4} />
                  <path d="M-21 -14 H21 V-8 H-21 Z" fill={FUR} />
                  <circle cx={-12} cy={3} r={5.4} fill={CREAM_SHADE} stroke={INK} strokeWidth={2} />
                  <path d="M-3 0 H16 M-3 7 H11" stroke={INK} strokeWidth={2.6} strokeLinecap="round" opacity={0.55} />
                </g>
              </g>
              <Arm d="M152 174 Q174 174 190 156" />
            </Hold>
          )}
          {mood === "stern" && (
            <>
              <Arm d="M82 182 Q96 204 134 172" anim="yk-breathe" />
              <Arm d="M138 182 Q124 204 86 172" anim="yk-breathe" />
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
