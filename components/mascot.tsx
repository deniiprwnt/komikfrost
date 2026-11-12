/**
 * Yuki — maskot KomikFrost: rubah salju teal yang imut, bermata besar berkilau,
 * berpipi bulat merona, berekor kembar yang lebat, bersyal mint empuk dan berjubah
 * biru malam berhias salju. Digambar sebagai SVG murni (gradasi lembut, garis tinta
 * tipis, kilau & cahaya tepi) — satu komponen, delapan ekspresi — dipakai oleh halaman
 * masuk dan semua layar error.
 *
 * Tanpa hook → aman dari server maupun client component. ID <clipPath>/<gradient>
 * statis (`yk-*`): pasang SATU maskot per halaman.
 */
import { FrostMark } from "@/components/frost-mark";
import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";

export type Mood = "happy" | "lost" | "stern" | "tired" | "dizzy" | "faint" | "puzzled" | "guard";

const INK = "#0f2528";
const FUR = "#22b5a9";
const FUR_LIGHT = "#6fe6d8";
const FUR_SHADE = "#0e8580";
const CREAM = "#f6fdfb";
const CREAM_SHADE = "#cfeae6";
const NAVY = "#2c3a8c";
const NAVY_LIGHT = "#5568d0";
const NAVY_DARK = "#171e55";
const ICE = "#c9f7f0";
const ICE_DEEP = "#7fe3d6";
const GOLD = "#f5c24f";
const PINK = "#ff9fb2";
const MOUTH = "#5c1f31";
const VEST = "#7c9170";
const VEST_DARK = "#586d50";
const HAORI = "#faf7f1";
const HAORI_SHADE = "#e0d9cc";
const HAORI_LINE = "#b9b1a4";
const FLAME = "#e0282d";
const FLAME_IN = "#9a1519";
const BANDAGE = "#f4eee2";
const BANDAGE_LINE = "#b9b1a4";
const OUT = 3.6; // tebal garis tinta utama

/**
 * Kaki depan rubah yang bulat & empuk. Arah depan = +x; pangkal di x≈-9.
 *  - "paw"  : punggung kaki, santai/menggantung.
 *  - "palm" : telapak terbuka: bantalan merah muda (melambai).
 *  - "grip" : kaki yang memeluk/menekan tepi benda.
 */
export type PawKind = "paw" | "palm" | "grip";

function FoxPaw({ kind = "paw" }: { kind?: PawKind }) {
  const grip = kind === "grip";
  const body = grip ? { cx: 2, rx: 9.8, ry: 11.8 } : { cx: 3.4, rx: 12.8, ry: 9.6 };
  const toes: [number, number, number, number][] = grip
    ? [[10.8, -8.4, 4.6, 4], [12, -2.8, 4.8, 4], [12, 2.8, 4.8, 4], [10.8, 8.4, 4.6, 4]]
    : [[13.4, -6.6, 4.4, 3.8], [15.6, -2.2, 4.6, 3.9], [15.6, 2.2, 4.6, 3.9], [13.4, 6.6, 4.4, 3.8]];
  return (
    <g className="yk-paw">
      <g fill={INK} stroke={INK} strokeWidth={4.2} strokeLinejoin="round">
        <ellipse cx={body.cx} cy={0} rx={body.rx} ry={body.ry} />
        {toes.map(([x, y, rx, ry]) => <ellipse key={y + "" + x} cx={x} cy={y} rx={rx} ry={ry} />)}
      </g>
      <ellipse cx={body.cx} cy={0} rx={body.rx} ry={body.ry} fill="url(#yk-fur)" />
      {toes.map(([x, y, rx, ry]) => <ellipse key={y + "" + x} cx={x} cy={y} rx={rx} ry={ry} fill="url(#yk-fur)" />)}
      {kind === "palm" ? (
        <>
          <path d="M-3.4 1.4 C-4.2 -3 0.6 -5.6 3.6 -3.8 C7 -5.6 11 -3 9.8 1.4 C8.8 5.4 5.6 7.6 3.6 7.6 C1.2 7.6 -2.6 5.4 -3.4 1.4 Z" fill={PINK} />
          {toes.map(([x, y]) => <ellipse key={"p" + y + x} cx={x - 0.8} cy={y * 0.92} rx={2} ry={2.3} fill={PINK} />)}
          <ellipse cx={1} cy={-0.6} rx={2.4} ry={1.3} fill="#fff" opacity={0.55} />
        </>
      ) : (
        <>
          <path d={grip ? "M-6.6 4 C-5 10.4 2.6 11.8 7 10.6 C1 8.2 -3.6 5.4 -6.6 4 Z" : "M-8.4 3.4 C-5 9 4 10.2 9 8.8 C3 7.6 -4 5 -8.4 3.4 Z"} fill={FUR_SHADE} opacity={0.6} />
          <path d={grip ? "M-5.4 -8.6 C-3 -10.8 1 -11 3.6 -10" : "M-7.4 -5.4 C-3 -8.2 3 -8.8 8 -7.6"} fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" opacity={0.55} />
          <path d={grip ? "M8 -5.6 L13.4 -5.6 M8.6 0 L14.6 0 M8 5.6 L13.4 5.6" : "M12 -4.4 L16.4 -4.6 M13 0 L18 0 M12 4.4 L16.4 4.6"} fill="none" stroke={INK} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
        </>
      )}
    </g>
  );
}

/** Lengan mungil berbalut lengan jubah biru malam, manset bulu putih empuk, dan telapak bulat. */
function Arm({ d, anim, kind = "paw", turn = 0 }: { d: string; anim?: string; kind?: PawKind; turn?: number }) {
  // Arah lengan dari dua titik terakhir path → telapak diputar searah lengan.
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const [cx, cy, ex, ey] = n.slice(-4);
  const deg = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
  return (
    <g className={anim} style={anim ? { transformOrigin: `${n[0]}px ${n[1]}px` } : undefined}>
      <path d={d} fill="none" stroke={INK} strokeWidth={20.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={NAVY} strokeWidth={16.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={NAVY_DARK} strokeWidth={5} strokeLinecap="round" opacity={0.7} transform="translate(1.4 3)" />
      <path d={d} fill="none" stroke={NAVY_LIGHT} strokeWidth={2.6} strokeLinecap="round" opacity={0.95} transform="translate(-2.8 -3)" />
      <g transform={`translate(${ex} ${ey}) rotate(${deg})`}>
        {/* manset jonin + perban pergelangan */}
        <g transform="translate(-4.5 0)">
          <rect x={-19} y={-10.6} width={14} height={21.2} rx={3.4} fill={BANDAGE} stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
          <path d="M-19 5.2 H-5 V7.2 Q-5 10.6 -8.4 10.6 H-15.6 Q-19 10.6 -19 7.2 Z" fill={BANDAGE_LINE} opacity={0.45} />
          <path d="M-14.2 -9.2 V9.2 M-9.8 -9.2 V9.2" fill="none" stroke={BANDAGE_LINE} strokeWidth={1.5} strokeLinecap="round" />
          <path d="M-16.6 -6.6 H-7.6" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
          </g>
        <g transform={turn ? `rotate(${turn} 3.4 0)` : undefined}><FoxPaw kind={kind} /></g>
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

const EAR_PATH = "M54 90 C44 60 50 32 62 8 C64 5 67 5 70 7 C96 20 113 48 116 86 Z";

/** Telinga rubah (runcing membulat, ujung gelap, bagian dalam krem-merah muda); sisi kanan = cermin sisi kiri. */
function Ear({ deg, side }: { deg: number; side: "l" | "r" }) {
  const t = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g className="yk-follow">
      <g transform={t}>
        <g transform={`rotate(${deg} 90 80)`}>
          <path d={EAR_PATH} fill="url(#yk-fur)" />
          <g clipPath="url(#yk-ear)">
            <path d="M62 4 C80 8 96 22 104 40 L52 52 C50 34 54 18 62 4 Z" fill="url(#yk-ear-tip)" />
          </g>
          <path d="M67 84 C60 64 62 48 69 33 C87 43 99 60 101 82 Z" fill="url(#yk-ear-in)" />
          <path d="M72 80 C68 66 70 56 74 46" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
          <path d={EAR_PATH} fill="none" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          <path d="M56 80 C50 62 52 44 59 28" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.35} />
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
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Titik salju kecil melayang (hiasan, tanpa tinta). */
function Flake({ x, y, r = 2.4, className, delay = 0 }: { x: number; y: number; r?: number; className?: string; delay?: number }) {
  return <circle className={className} style={delay ? { animationDelay: `${delay}s` } : undefined} cx={x} cy={y} r={r} fill="#fff" opacity={0.95} stroke="#9fe6dd" strokeWidth={1} />;
}

/** Ikat kepala shinobi Konoha: kain biru, pelat baja berkilau berlambang daun, dua tutup ujung berpaku. */
const PLATE_BOX = { cx: 110, cy: 63, w: 78, h: 30 };

function Headband() {
  const { cx, cy, w, h } = PLATE_BOX;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const cap = 7;
  const ix = x + cap;
  const iw = w - cap * 2;
  const iy = y + 4;
  const ih = h - 8;
  const pad = 2.4;
  const rivets = [
    [ix + 5, iy + 4.5],
    [ix + 5, iy + ih - 4.5],
    [ix + iw - 5, iy + 4.5],
    [ix + iw - 5, iy + ih - 4.5],
  ];
  return (
    <g>
      <g clipPath="url(#yk-head)">
        <path d="M34 70 Q110 40 186 70 L186 86 Q110 56 34 86 Z" fill="url(#yk-band)" />
        <path d="M34 70 Q110 40 186 70 L186 75 Q110 45 34 75 Z" fill="#fff" opacity={0.25} />
        <path d="M34 80 Q110 50 186 80 L186 86 Q110 56 34 86 Z" fill="#0a2470" opacity={0.4} />
        <path d="M34 70 Q110 40 186 70 M34 86 Q110 56 186 86" fill="none" stroke={INK} strokeWidth={3.2} />
        <path d="M44 74 Q110 48 176 74" fill="none" stroke="#9bb6ff" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7} className="yk-fine" />
      </g>
      <rect x={x + 1.5} y={y + 3.5} width={w} height={h} rx={7} fill={INK} opacity={0.24} />
      <rect x={x} y={y} width={w} height={h} rx={7} fill="url(#yk-steel)" stroke={INK} strokeWidth={3.4} />
      <rect x={ix + 1} y={iy} width={iw - 2} height={ih} rx={3.4} fill="#e8eff4" stroke="#8d9ea9" strokeWidth={1.2} />
      <path d={`M${ix + 3.5} ${iy + 1.7} H${ix + iw - 3.5}`} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.95} />
      <path d={`M${x + cap} ${y + 3} V${y + h - 3} M${x + w - cap} ${y + 3} V${y + h - 3}`} stroke="#8d9ea9" strokeWidth={1.2} opacity={0.8} className="yk-fine" />
      {rivets.map(([rx, ry]) => (
        <circle key={`${rx}-${ry}`} cx={rx} cy={ry} r={1.9} fill="#74848f" stroke={INK} strokeWidth={0.8} className="yk-fine" />
      ))}
      <KonohaMark x={cx - (ih - pad * 2) * 0.62} y={iy + pad} w={(ih - pad * 2) * 1.24} h={ih - pad * 2} color="#26343c" />
    </g>
  );
}

/** Kerah syal biru berbentuk V (lambang spiral di tengah), di atas rompi & di bawah bahu jubah. */
function Collar() {
  const d = 17;
  return (
    <g>
      <path d="M64 158 Q110 181 156 158 L159 171 L110 198 L61 171 Z" fill="url(#yk-collar)" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
      <path d="M70 164 Q110 183 150 164" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.35} />
      <UzumakiMark x={110 - d / 2} y={174.5} w={d} h={d} ink={INK} red="#e22a2c" />
    </g>
  );
}

/** Motif lidah api di tepi bawah jubah Hokage: datar, tanpa animasi. */
function FlameRow({ xs, by, hs = [24, 17], w = 9 }: { xs: number[]; by: number; hs?: number[]; w?: number }) {
  return (
    <>
      {xs.map((cx, i) => {
        const h = hs[i % hs.length];
        return (
          <g key={cx}>
            <path d={`M${cx - w} ${by} C${cx - w} ${by - h * 0.45} ${cx - w * 0.2} ${by - h * 0.55} ${cx + w * 0.1} ${by - h} C${cx + w * 0.1} ${by - h * 0.5} ${cx + w} ${by - h * 0.5} ${cx + w} ${by} Z`} fill="url(#yk-flame)" />
            <path d={`M${cx - w * 0.4} ${by} C${cx - w * 0.4} ${by - h * 0.3} ${cx - w * 0.1} ${by - h * 0.45} ${cx + w * 0.1} ${by - h * 0.7} C${cx + w * 0.2} ${by - h * 0.4} ${cx + w * 0.5} ${by - h * 0.3} ${cx + w * 0.5} ${by} Z`} fill={FLAME_IN} opacity={0.45} />
          </g>
        );
      })}
    </>
  );
}

const WING_OUTER = "M68 160 C55 178 44 206 45 238 Q55 245 66 241 Q78 237 90 241";
const PANEL_L = "M62 157 Q75 150 88 160 C93 190 79 212 85 235 Q76 243 66 239.5 Q56 236 48 241.5 C40 224 45 200 46 182 C47 170 55 161 62 157 Z";
const PANEL_R = "M158 157 Q145 150 132 160 C127 190 141 212 135 235 Q144 243 154 239.5 Q164 236 172 241.5 C180 224 175 200 174 182 C173 170 165 161 158 157 Z";
const BACK_PANEL = "M70 160 L150 160 L151 237 Q140 243 130 239.5 Q120 236 110 241 Q100 246 90 239.5 Q80 236 69 237 Z";
const BACK_HEM = "M151 237 Q140 243 130 239.5 Q120 236 110 241 Q100 246 90 239.5 Q80 236 69 237";

function CapeWing({ side }: { side: "l" | "r" }) {
  const mirror = side === "l" ? undefined : "translate(220 0) scale(-1 1)";
  return (
    <g className={side === "l" ? "yk-wing yk-wing-l" : "yk-wing yk-wing-r"}>
      <g transform={mirror}>
        <path d={`${WING_OUTER} L100 166 Z`} fill="url(#yk-haori)" />
        <g clipPath="url(#yk-wing-clip)">
          <path d="M80 166 C66 180 56 206 52 236 Q66 234 80 237 Q82 196 94 172 Z" fill={HAORI_SHADE} opacity={0.9} />
          <path d="M68 176 Q58 200 54 226 M88 182 Q82 204 80 228" fill="none" stroke={HAORI_LINE} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          <path d="M36 234.5 L112 234.5 L112 252 L36 252 Z" fill={FLAME} />
          <FlameRow xs={[55, 68, 81, 94, 106]} by={235} hs={[8, 6]} w={6.5} />
        </g>
        <path d={WING_OUTER} fill="none" stroke={INK} strokeWidth={OUT} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** Punggung jubah: menyambung dari bahu sampai tepi bawah, supaya celah antar kaki tidak kosong. */
function Cape() {
  return (
    <g>
      <path d={BACK_PANEL} fill={HAORI_SHADE} />
      <path d="M99 170 Q96 205 98 230 M121 170 Q124 205 122 230" fill="none" stroke={HAORI_LINE} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
      <g clipPath="url(#yk-back-clip)">
        <path d="M66 234.5 L154 234.5 L154 252 L66 252 Z" fill={FLAME} />
        <FlameRow xs={[100, 110, 120]} by={235} hs={[8, 6]} w={6} />
      </g>
      <path d={BACK_HEM} fill="none" stroke={INK} strokeWidth={OUT} strokeLinecap="round" strokeLinejoin="round" />
      <CapeWing side="l" />
      <CapeWing side="r" />
    </g>
  );
}

/** Dua panel depan haori Hokage (terbuka dari bahu sampai bawah, api merah di ujung) + bahu. */
function HaoriFront() {
  return (
    <g>
      <g stroke={INK} strokeLinejoin="round">
        <path d={PANEL_L} fill="url(#yk-haori)" strokeWidth={3.4} />
        <path d={PANEL_R} fill="url(#yk-haori)" strokeWidth={3.4} />
        <path d="M63 159 Q74 152 88 159 L84 171 Q72 175 60 168 Z" fill="#fff" strokeWidth={3} />
        <path d="M157 159 Q146 152 132 159 L136 171 Q148 175 160 168 Z" fill="#fff" strokeWidth={3} />
        <path d="M66 162 Q74 157 82 161 M138 161 Q146 157 154 162" fill="none" stroke="#cfc8bc" strokeWidth={1.8} strokeLinecap="round" />
      </g>
      <path d="M52 190 Q50 212 56 228 M168 190 Q170 212 164 228 M74 190 Q72 206 76 222 M146 190 Q148 206 144 222" fill="none" stroke={HAORI_LINE} strokeWidth={1.8} strokeLinecap="round" opacity={0.5} className="yk-fine" />
      <g clipPath="url(#yk-panel-l)"><path d="M40 234.5 L88 234.5 L88 250 L40 250 Z" fill={FLAME} /><FlameRow xs={[55.5, 65.5, 75.5]} by={235} hs={[9, 13, 8]} w={5.6} /></g>
      <g clipPath="url(#yk-panel-r)"><path d="M132 234.5 L180 234.5 L180 250 L132 250 Z" fill={FLAME} /><FlameRow xs={[144.5, 154.5, 164.5]} by={235} hs={[8, 13, 9]} w={5.6} /></g>
    </g>
  );
}

/** Baju jonin: rompi flak hijau berkantong + sabuk biru berpelat. */
function Vest() {
  return (
    <g>
      <path d="M66 174 Q110 195 154 174 L148 207 Q110 219 72 207 Z" fill="url(#yk-vest)" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
      <path d="M72 180 Q110 198 148 180 L146 186 Q110 203 74 186 Z" fill="#b4c8a6" opacity={0.5} />
      {[[88, 189], [122, 189]].map(([x, y]) => (
        <g key={x}>
          <rect x={x} y={y} width={10} height={11} rx={2} fill={VEST_DARK} stroke={INK} strokeWidth={2.2} />
          <path d={`M${x + 1.2} ${y + 4} H${x + 8.8}`} stroke="#9db38f" strokeWidth={1.2} strokeLinecap="round" />
          <circle cx={x + 5} cy={y + 7.5} r={1.2} fill="#c9d6bf" className="yk-fine" />
        </g>
      ))}
      <path d="M110 180 V183 M110 198 V206" stroke="#3c4b36" strokeWidth={2} strokeLinecap="round" />
      <path d="M82 205 Q110 215 138 205 L136 213 Q110 222 84 213 Z" fill="url(#yk-navy)" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <rect x={103} y={208} width={14} height={9} rx={2.5} fill="url(#yk-steel)" stroke={INK} strokeWidth={2.4} />
      <rect x={107} y={210.5} width={6} height={4} rx={1} fill="none" stroke="#74848f" strokeWidth={1.2} className="yk-fine" />
    </g>
  );
}

/** Mata besar berkilau. `lx/ly` menggeser arah pandang. */
function Eye({ x, y, lx = 0, ly = 0, blink = true, shine = "normal" }: { x: number; y: number; lx?: number; ly?: number; blink?: boolean; shine?: "normal" | "wet" | "sparkle" }) {
  const left = x < 110;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={blink ? "yk-blink" : undefined}>
        <ellipse rx={13.2} ry={16} fill={INK} />
        <g className="yk-look">
          <g transform={`translate(${lx} ${ly})`}>
            <ellipse cy={1.6} rx={10.8} ry={13.6} fill="url(#yk-iris)" />
            <ellipse cy={4.4} rx={5.6} ry={7.2} fill="#05222b" />
            <ellipse cy={9.4} rx={7.4} ry={3.4} fill="#a6fff0" opacity={0.5} />
            {shine === "wet" ? (
              <>
                <circle cx={-4.6} cy={-5.4} r={5.2} fill="#fff" />
                <circle cx={4.6} cy={5.6} r={2.4} fill="#fff" opacity={0.95} />
                <ellipse cy={12.4} rx={6} ry={1.6} fill="#fff" opacity={0.7} />
              </>
            ) : (
              <>
                <circle cx={-4.6} cy={-5.6} r={4.6} fill="#fff" />
                <circle cx={4.6} cy={5.4} r={2.2} fill="#fff" opacity={0.95} />
              </>
            )}
            {shine === "sparkle" && <path transform="translate(5.6 -7) scale(.55)" d="M0 -9 Q1.5 -1.5 9 0 Q1.5 1.5 0 9 Q-1.5 1.5 -9 0 Q-1.5 -1.5 0 -9 Z" fill="#fff" />}
          </g>
        </g>
        {/* bulu mata: lengkung kelopak + jentikan di sudut luar */}
        <path d="M-12.6 -5 Q-9 -16.4 0 -16.6 Q9 -16.4 12.6 -5" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
        <path d={left ? "M-12 -8 L-17.5 -11.6" : "M12 -8 L17.5 -11.6"} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Hidung rubah: segitiga bulat kecil + kilau + garis filtrum. `x` menggeser (mis. saat menoleh). */
function Nose({ x = 0 }: { x?: number }) {
  return (
    <g transform={`translate(${x} -3)`}>
      <path d="M103 125 Q110 121 117 125 Q115 132.500 110 133.500 Q105 132.500 103 125 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <ellipse cx={107.600} cy={125} rx={2.400} ry={1.100} fill="#fff" opacity={0.85} />
      <path d="M110 133.500 V138" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
}

function Drop({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <path
      className={className}
      transform={`translate(${x} ${y})`}
      d="M0 -10 C6 -2 8 3 0 9 C-8 3 -6 -2 0 -10 Z"
      fill="#bfeaff"
      stroke={INK}
      strokeWidth={2.6}
      strokeLinejoin="round"
    />
  );
}

function Star({ x, y, s = 1, fill = "#f5c24f" }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -9 L2.6 -2.8 L9 -2.4 L4 1.8 L5.6 8.2 L0 4.6 L-5.6 8.2 L-4 1.8 L-9 -2.4 L-2.6 -2.8 Z"
      fill={fill}
      stroke={INK}
      strokeWidth={2.2}
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
        <path d={p} stroke="#ff5a4f" strokeWidth={3.4} />
      </g>
    </g>
  );
}

function Spiral({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={15.5} fill="#fff" stroke={INK} strokeWidth={3.6} />
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

/** Dua ekor lebat berujung krem berkilau di sisi kanan; yang kedua mengipas ke bawah di belakangnya. */
const TAIL_BODY = "M126 208 C152 234 210 226 220 182 C224 160 214 142 202 136 C200 164 178 190 134 186 Z";
const TAIL_TIP = "M220 182 C224 160 214 142 202 136 C201 148 198 158 190 168 Q197 169 197 175 Q203 173 205 179 Q211 177 213 184 Q217 186 220 182 Z";

function FoxTail({ delay = 0, back = false }: { delay?: number; back?: boolean }) {
  return (
    <g className="yk-fox-tail" style={delay ? { animationDelay: `-${delay}s` } : undefined}>
      <g transform={back ? "rotate(34 128 198) translate(-4 6)" : undefined}>
        <path d={TAIL_BODY} fill={back ? "url(#yk-tail-back)" : "url(#yk-tail)"} />
        <path d={TAIL_TIP} fill={CREAM} />
        <path d="M138 200 C170 214 202 204 212 176" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={back ? 0.18 : 0.35} />
        <path d={TAIL_BODY} fill="none" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
        <path d="M190 168 Q197 169 197 175 Q203 173 205 179 Q211 177 213 184" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      </g>
    </g>
  );
}

function FoxTails() {
  return (
    <>
      <FoxTail back delay={1.6} />
      <FoxTail />
    </>
  );
}

/** Kaki: celana jonin biru berperban + sandal shinobi bersol gelap. Digambar DI BELAKANG badan agar jubah menutup pangkalnya. */
function Legs() {
  return (
    <g>
      {[93.5, 126.5].map((x, i) => (
        <g key={x} transform={`translate(${x} 238) scale(${i ? "-0.9" : "0.9"} 1)`}>
          <g className={i ? "yk-foot yk-foot-r" : "yk-foot"}>
            <path d="M-11 -24 H11 L12.5 0.5 Q0 5 -12.5 0.5 Z" fill="url(#yk-navy)" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />
            <path d="M-6 -22 V-4" stroke={NAVY_LIGHT} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
            <path d="M-12 -2.5 Q0 1.5 12 -2.5" fill="none" stroke={BANDAGE} strokeWidth={2.6} strokeLinecap="round" />
            <path d="M-12.2 -7.5 Q0 -4 12.2 -7.5" fill="none" stroke={BANDAGE} strokeWidth={2.6} strokeLinecap="round" className="yk-fine" />
            <path d="M-13.5 1.5 Q-15.5 11 -16 18.5 Q-16.5 25.5 -8 26 L8 26 Q16.5 25.5 16 18.5 Q15.5 11 13.5 1.5 Z" fill="url(#yk-navy)" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />
            <path d="M-14.6 15.5 Q0 10 14.6 15.5 Q16 18 15.6 20.5 Q0 24 -15.6 20.5 Q-16 18 -14.6 15.5 Z" fill={NAVY_LIGHT} />
            <path d="M-15.8 20.6 Q0 24.4 15.8 20.6 Q16.8 26 8 26.5 L-8 26.5 Q-16.8 26 -15.8 20.6 Z" fill="#171d47" />
            <path d="M-16 20.8 Q0 24.6 16 20.8" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
            <path d="M0 14.8 V23" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
            <path d="M-12 4.5 Q0 8.5 12 4.5" fill="none" stroke={BANDAGE} strokeWidth={2.2} strokeLinecap="round" />
            <path d="M-11 12.5 Q-6 10.5 -2 11.5" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.45} className="yk-fine" />
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
        <radialGradient id="yk-fur" cx="0.36" cy="0.26" r="0.9">
          <stop offset="0" stopColor="#58dccd" />
          <stop offset="0.5" stopColor="#25b8ac" />
          <stop offset="1" stopColor="#0f8983" />
        </radialGradient>
        <linearGradient id="yk-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcf1ee" />
        </linearGradient>
        <linearGradient id="yk-ear-in" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4f5" />
          <stop offset="1" stopColor="#ffc3cf" />
        </linearGradient>
        <linearGradient id="yk-ear-tip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b4e52" />
          <stop offset="1" stopColor="#0f6f72" />
        </linearGradient>
        <radialGradient id="yk-iris" cx="0.5" cy="0.2" r="0.95">
          <stop offset="0" stopColor="#8af5e8" />
          <stop offset="0.45" stopColor="#2aa3b0" />
          <stop offset="1" stopColor="#0b3441" />
        </radialGradient>
        <linearGradient id="yk-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d6e6ef" />
          <stop offset="1" stopColor="#a4c1d2" />
        </linearGradient>
        <linearGradient id="yk-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f6fe0" />
          <stop offset="1" stopColor="#0a3590" />
        </linearGradient>
        <linearGradient id="yk-scarf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4fff9" />
          <stop offset="1" stopColor="#8be9dc" />
        </linearGradient>
        <linearGradient id="yk-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffeaa3" />
          <stop offset="1" stopColor="#f0b13c" />
        </linearGradient>
        <linearGradient id="yk-cape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4aa8" />
          <stop offset="1" stopColor="#1a2258" />
        </linearGradient>
        <linearGradient id="yk-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4150b4" />
          <stop offset="1" stopColor="#222c70" />
        </linearGradient>
        <linearGradient id="yk-tail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0f8983" />
          <stop offset="1" stopColor="#3ccfc0" />
        </linearGradient>
        <linearGradient id="yk-tail-back" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0b6f6b" />
          <stop offset="1" stopColor="#1fa89c" />
        </linearGradient>
        <linearGradient id="yk-cover" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3be0cf" />
          <stop offset="1" stopColor="#0e7a84" />
        </linearGradient>
        <radialGradient id="yk-blush" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff8fa3" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff8fa3" stopOpacity="0" />
        </radialGradient>
        <clipPath id="yk-head">
          <ellipse cx={110} cy={106} rx={74} ry={60} />
        </clipPath>
        <linearGradient id="yk-haori" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ebe5d9" />
        </linearGradient>
        <linearGradient id="yk-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#c41e24" />
          <stop offset="1" stopColor="#ff6a45" />
        </linearGradient>
        <linearGradient id="yk-vest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93ab84" />
          <stop offset="1" stopColor="#5f7655" />
        </linearGradient>
        <linearGradient id="yk-collar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f72e6" />
          <stop offset="1" stopColor="#0d3f9f" />
        </linearGradient>
        <clipPath id="yk-wing-clip"><path d={`${WING_OUTER} L100 166 Z`} /></clipPath>
        <clipPath id="yk-back-clip"><path d={BACK_PANEL} /></clipPath>
        <clipPath id="yk-panel-l"><path d={PANEL_L} /></clipPath>
        <clipPath id="yk-panel-r"><path d={PANEL_R} /></clipPath>
        <clipPath id="yk-ear"><path d={EAR_PATH} /></clipPath>
      </defs>

      {/* tanah */}
      <ellipse className="yk-shadow" cx={110} cy={262} rx={66} ry={6.5} fill="#0b3b40" opacity={0.3} />
      <ellipse cx={110} cy={261.5} rx={44} ry={3.4} fill="#06262a" opacity={0.28} />

      <g transform={mood === "faint" ? "rotate(-11 110 210)" : undefined}>
        <g className={mood === "faint" ? "yk-limp" : "yk-bob"}>
          {/* dua ekor lebat (di belakang badan) */}
          <FoxTails />

          {/* jubah di belakang badan */}
          <Cape />

          {/* telinga */}
          <Ear deg={eL} side="l" />
          <Ear deg={eR} side="r" />

          {/* kaki (di belakang badan) */}
          <Legs />

          {/* badan: kaus dalam jonin biru + rompi flak */}
          <path d="M78 156 C72 186 88 206 110 206 C132 206 148 186 142 156 Z" fill="url(#yk-navy)" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          <Vest />

          {/* lengan belakang (pose) */}
          {(mood === "happy" || mood === "guard") && <g className="yk-reach-l"><Arm d="M70 176 Q48 180 30 160" anim="yk-wave" kind="palm" /></g>}
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
              <g className="yk-reach-l"><Arm d="M70 176 Q50 178 32 158" anim="yk-flail-l" kind="palm" /></g>
              <g className="yk-reach"><Arm d="M150 176 Q170 178 188 158" anim="yk-flail-r" kind="palm" /></g>
            </>
          )}
          {mood === "faint" && (
            <>
              <Arm d="M70 176 Q60 196 56 210" anim="yk-sway-l" />
              <Arm d="M150 176 Q160 196 164 210" anim="yk-sway-r" />
            </>
          )}

          <g className="yk-follow">
            {/* rumbai pipi: lembut & membulat */}
            <g>
              <path d="M48 112 Q26 112 16 124 Q30 126 32 132 Q20 138 24 150 Q46 152 62 146 Z" fill={CREAM} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
              <path d="M172 112 Q194 112 204 124 Q190 126 188 132 Q200 138 196 150 Q174 152 158 146 Z" fill={CREAM} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            </g>

            {/* kepala */}
            <ellipse cx={110} cy={106} rx={74} ry={60} fill={FUR_SHADE} />
            <ellipse cx={104} cy={100} rx={73} ry={57} fill="url(#yk-fur)" clipPath="url(#yk-head)" />
            <ellipse cx={92} cy={80} rx={46} ry={22} fill={FUR_LIGHT} opacity={0.4} clipPath="url(#yk-head)" />
            <g clipPath="url(#yk-head)">
              <path d="M30 124 Q62 118 86 134 Q98 142 110 142 Q122 142 134 134 Q158 118 190 124 L190 182 L30 182 Z" fill={CREAM_SHADE} />
              <path d="M28 122 Q60 116 84 132 Q98 140 108 140 Q120 140 132 132 Q156 116 186 122 L186 182 L28 182 Z" fill="url(#yk-face)" />
            </g>
            <ellipse cx={110} cy={106} rx={74} ry={60} fill="none" stroke={INK} strokeWidth={OUT} />
            <path d="M42 96 Q46 70 70 56" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.35} />

            {/* pipi merona */}
            <ellipse cx={58} cy={136} rx={15} ry={8.5} fill="url(#yk-blush)" opacity={mood === "tired" ? 1 : 0.85} />
            <ellipse cx={162} cy={136} rx={15} ry={8.5} fill="url(#yk-blush)" opacity={mood === "tired" ? 1 : 0.85} />

            {/* wajah */}
            {mood === "happy" && (
              <>
                <Eye x={79} y={110} shine="sparkle" />
                <Eye x={141} y={110} shine="sparkle" />
                <Nose />
                <path d="M99 141 Q110 165 121 141 Z" fill={MOUTH} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
                <path d="M101.800 142.500 L106.400 142.500 L104.100 148 Z M113.600 142.500 L118.200 142.500 L115.900 148 Z" fill="#fff" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
                <Sparkle x={26} y={78} s={1} className="yk-twinkle" />
                <Sparkle x={198} y={34} s={0.75} fill="#a6ece2" className="yk-twinkle" delay={0.6} />
                <Flake x={14} y={104} r={2.4} className="yk-twinkle" delay={0.3} />
                <Flake x={208} y={92} r={2.2} className="yk-twinkle" delay={0.9} />
              </>
            )}
            {mood === "lost" && (
              <>
                <Eye x={79} y={110} lx={-3.500} ly={-2.500} shine="wet" />
                <Eye x={141} y={110} lx={-3.500} ly={-2.500} shine="wet" />
                <path d="M62 134 q-5 7 0 11 q5 -4 0 -11 Z M158 134 q-5 7 0 11 q5 -4 0 -11 Z" fill="#bfeaff" stroke={INK} strokeWidth={2.200} strokeLinejoin="round" />
                <Nose x={-2} />
                <ellipse cx={108} cy={148} rx={4.800} ry={6} fill={MOUTH} stroke={INK} strokeWidth={3} />
                <Drop x={178} y={82} className="yk-drip" />
                <g className="yk-qmark">
                  <text x={192} y={62} fontSize={44} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#3b83d6" stroke={INK} strokeWidth={4} paintOrder="stroke" textAnchor="middle">
                    ?
                  </text>
                </g>
              </>
            )}
            {mood === "puzzled" && (
              <>
                <Eye x={79} y={110} lx={3} ly={3} shine="wet" />
                <Eye x={141} y={110} lx={3} ly={3} shine="wet" />
                <path d="M62 90 Q76 85 96 92" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
                <path d="M126 88 Q142 78 158 88" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
                <Nose />
                <path d="M96 149 q5 -7 10 0 t10 0 t10 0" fill="none" stroke={INK} strokeWidth={3.800} strokeLinecap="round" />
                <Drop x={44} y={90} className="yk-drip" />
                <text x={30} y={62} fontSize={30} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#3b83d6" stroke={INK} strokeWidth={3.400} paintOrder="stroke" textAnchor="middle" transform="rotate(-14 30 62)">?</text>
              </>
            )}
            {mood === "stern" && (
              <>
                <Eye x={79} y={112} blink={false} />
                <Eye x={141} y={112} blink={false} />
                {/* kelopak turun miring = tatapan tajam */}
                <path d="M60 92 L98 107 L98 78 L60 78 Z" fill="#27b9ad" />
                <path d="M160 92 L122 107 L122 78 L160 78 Z" fill="#27b9ad" />
                <path d="M60 91 L99 107 M160 91 L121 107" stroke={INK} strokeWidth={5} strokeLinecap="round" />
                <Nose />
                <path d="M99 151 Q110 141 121 151" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
                <path d="M104.500 147 L108 147 L106.200 152.500 Z" fill="#fff" stroke={INK} strokeWidth={1.400} strokeLinejoin="round" />
                <Vein x={44} y={96} />
              </>
            )}
            {mood === "tired" && (
              <>
                <path d="M64 98 L92 111 L64 124 M156 98 L128 111 L156 124" fill="none" stroke={INK} strokeWidth={5.400} strokeLinecap="round" strokeLinejoin="round" />
                <Nose />
                <path d="M98 143 Q110 137 122 143 Q120 159 110 159 Q100 159 98 143 Z" fill={MOUTH} stroke={INK} strokeWidth={3.400} strokeLinejoin="round" />
                <ellipse cx={110} cy={154.500} rx={6.500} ry={3.600} fill={PINK} />
                <Drop x={44} y={96} className="yk-drip" />
                <Drop x={178} y={104} className="yk-drip yk-drip2" />
                <Drop x={160} y={58} className="yk-drip yk-drip3" />
                <g className="yk-soul">
                  <circle cx={152} cy={44} r={4.500} fill="#fff" stroke={INK} strokeWidth={2.600} />
                  <circle cx={163} cy={32} r={6.500} fill="#fff" stroke={INK} strokeWidth={2.800} />
                  <circle cx={177} cy={18} r={9} fill="#fff" stroke={INK} strokeWidth={3} />
                </g>
              </>
            )}
            {mood === "dizzy" && (
              <>
                <Spiral x={84} y={109} />
                <Spiral x={136} y={109} />
                <Nose />
                <path d="M99 149 q5 -7 10 0 t10 0 t10 0" fill="none" stroke={INK} strokeWidth={3.800} strokeLinecap="round" strokeLinejoin="round" />
                <ellipse cx={110} cy={74} rx={26} ry={9} fill={INK} opacity={0.12} />
              </>
            )}
            {mood === "faint" && (
              <>
                <path d="M68 100 L92 124 M92 100 L68 124 M128 100 L152 124 M152 100 L128 124" stroke={INK} strokeWidth={5.400} strokeLinecap="round" />
                <Nose />
                <g className="yk-soul">
                  <ellipse cx={110} cy={26} rx={28} ry={8} fill="none" stroke={INK} strokeWidth={9} />
                  <ellipse cx={110} cy={26} rx={28} ry={8} fill="none" stroke="#f5c24f" strokeWidth={4.600} />
                </g>
                <ellipse cx={110} cy={150} rx={7.500} ry={9.500} fill={MOUTH} stroke={INK} strokeWidth={3.400} />
                <ellipse cx={110} cy={156} rx={4.600} ry={3.400} fill={PINK} />
              </>
            )}
            {mood === "guard" && (
              <>
                <Eye x={79} y={110} lx={2} ly={-1} />
                <Eye x={141} y={110} lx={2} ly={-1} />
                <path d="M62 94 Q78 89 96 95" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
                <path d="M126 86 Q142 73 158 84" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
                <Nose />
                <path d="M99 149 Q110 155 121 147" fill="none" stroke={INK} strokeWidth={3.800} strokeLinecap="round" />
                <g className="yk-qmark">
                  <text x={194} y={64} fontSize={42} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#9a8af0" stroke={INK} strokeWidth={4} paintOrder="stroke" textAnchor="middle">
                    ?
                  </text>
                </g>
              </>
            )}

            {/* ikat kepala */}
            <Headband />
          </g>

          {/* kerah syal biru + haori Hokage di atasnya */}
          <Collar />
          <HaoriFront />

          {/* properti & lengan depan (di atas kepala) */}
          {mood === "happy" && (
            <Hold at={[152, 174]} anim="yk-hold">
            <g className="yk-reach">
              <g className="yk-prop" style={{ transformOrigin: "192px 142px" }}><g transform="translate(200 121) rotate(8)">
                <rect x={-19} y={-25} width={38} height={50} rx={4} fill="#fff" stroke={INK} strokeWidth={3.400} />
                <rect x={-19} y={-25} width={34} height={50} rx={4} fill="url(#yk-cover)" stroke={INK} strokeWidth={3.400} />
                <rect x={-17} y={-23} width={6} height={46} rx={2} fill="#0a5d5a" opacity={0.7} />
                <FrostMark x={-8} y={-13} w={20} h={20} color="#fff" stroke={10} />
                <path d="M-8 14 H12" stroke="#fff" strokeWidth={2.400} strokeLinecap="round" opacity={0.7} />
                <Star x={12} y={-23} s={0.95} />
              </g></g>
              <Arm d="M152 174 Q186 176 192 142" kind="grip" />
            </g></Hold>
          )}
          {mood === "lost" && (
            <g className="yk-aim"><Hold at={[152, 174]} anim="yk-search">
            <g className="yk-reach">
              <g className="yk-prop" style={{ transformOrigin: "203px 146px" }}>{/* kaca pembesar TEGAK (miring tipis menjauhi wajah) agar lensa tidak menutupi muka */}
              <g fill="none" strokeLinecap="round" transform="rotate(6 203 146)">
                <path d="M203 154 L203 120" stroke={INK} strokeWidth={10} />
                <path d="M203 156 L203 113" stroke="#ffc83d" strokeWidth={6.400} />
                <path d="M205.2 156 L205.2 119" stroke="#d9961c" strokeWidth={1.800} opacity={0.75} />
                <path d="M201.2 154 L201.2 121" stroke="#fff4b8" strokeWidth={1.600} opacity={0.9} />
                <circle cx={203} cy={102} r={16} fill="#c4ecff" fillOpacity={0.85} stroke={INK} strokeWidth={5} />
                <circle cx={203} cy={102} r={11.500} fill="none" stroke="#fff" strokeWidth={1.600} opacity={0.5} />
                <rect x={198.500} y={116.500} width={9} height={6} rx={2.200} fill="#e8a91f" stroke={INK} strokeWidth={2.200} />
                <g transform="translate(203 102)"><g className="yk-glint"><path d="M-6.800 -2.200 Q-5.800 -5.800 -1.800 -7" stroke="#fff" strokeWidth={2.600} /></g></g>
              </g></g>
              <Arm d="M152 174 Q192 178 203 146" kind="grip" />
            </g></Hold></g>
          )}
          {mood === "puzzled" && (
            <Hold at={[152, 174]} anim="yk-hold">
            <g className="yk-reach">
              <g className="yk-prop" style={{ transformOrigin: "192px 142px" }}><g transform="translate(192 121) rotate(14)">
                <path d="M-18 -22 L16 -26 L22 4 L-14 10 Z" fill="#fff" stroke={INK} strokeWidth={3.600} strokeLinejoin="round" />
                <path d="M-10 -14 L8 -16 M-9 -6 L12 -9 M-9 2 L4 0" stroke={INK} strokeWidth={2.400} strokeLinecap="round" opacity={0.4} />
                <text x={4} y={-3} fontSize={26} fontWeight={900} fontFamily="var(--font-display), Arial Black, sans-serif" fill="#ff5a4f" stroke={INK} strokeWidth={3} paintOrder="stroke" textAnchor="middle">?!</text>
              </g></g>
              <Arm d="M152 174 Q186 176 192 140" kind="grip" />
            </g></Hold>
          )}
          {mood === "guard" && (
            <Hold at={[152, 174]} anim="yk-hold">
            <g className="yk-reach">
              <g className="yk-prop" style={{ transformOrigin: "192px 142px" }}><g transform="translate(195 120) rotate(8)">
                <g className="yk-card">
                  <rect x={-23} y={-16} width={46} height={32} rx={5} fill="#fff" stroke={INK} strokeWidth={3.600} />
                  <path d="M-20 -13.500 H20 V-8 H-20 Z" fill="url(#yk-cover)" />
                  <circle cx={-12} cy={3} r={5.400} fill={CREAM_SHADE} stroke={INK} strokeWidth={2} />
                  <path d="M-3 0 H16 M-3 7 H11" stroke={INK} strokeWidth={2.400} strokeLinecap="round" opacity={0.5} />
                </g>
              </g></g>
              <Arm d="M152 174 Q186 176 192 142" kind="grip" />
            </g></Hold>
          )}
          {mood === "stern" && (
            <>
              <Arm d="M82 182 Q96 204 134 172" kind="grip" anim="yk-breathe" />
              <Arm d="M138 182 Q124 204 86 172" kind="grip" anim="yk-breathe" />
            </>
          )}
        </g>

        {mood === "dizzy" && (
          <g className="yk-orbit">
            <Star x={34} y={88} s={0.68} fill="#ff9fb2" />
            <Star x={184} y={88} s={0.68} fill="#7fe3d6" />
            <Star x={110} y={34} s={0.72} />
          </g>
        )}

        {mood === "faint" && (
          <g className="yk-soul">
            <path d="M118 142 C156 132 140 104 176 80" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
            <path d="M118 142 C156 132 140 104 176 80" fill="none" stroke="#fff" strokeWidth={4.400} strokeLinecap="round" />
            <g transform="translate(40 -42)">
              <path d="M120 70 C120 44 168 44 168 70 L168 100 L158 92 L151 102 L144 92 L137 102 L130 92 L120 100 Z" fill="#fff" stroke={INK} strokeWidth={3.600} strokeLinejoin="round" />
              <circle cx={136} cy={72} r={3.200} fill={INK} />
              <circle cx={152} cy={72} r={3.200} fill={INK} />
              <ellipse cx={144} cy={82} rx={3.400} ry={4.200} fill={INK} />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
