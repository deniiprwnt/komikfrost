/**
 * Lambang Konoha (daun berputar) — satu sumber untuk semua maskot.
 *
 * Responsif & selalu pas: lambang digambar di <svg> bersarang dengan `viewBox`
 * yang PAS membungkus goresannya (hasil ukur getBBox + setengah tebal garis) dan
 * `preserveAspectRatio="xMidYMid meet"`. Jadi cukup beri kotak tujuan (x, y, w, h);
 * lambang otomatis diskalakan, di-tengah-kan, dan tidak pernah keluar kotak —
 * berapa pun ukuran pelat/ikat kepalanya.
 */
const SW = 31; // tebal garis dalam satuan viewBox lambang
const BOX = { x: 108, y: 135, w: 337, h: 280.45 }; // bbox geometri path (tanpa garis)
const VIEW = `${BOX.x - SW / 2} ${BOX.y - SW / 2} ${BOX.w + SW} ${BOX.h + SW}`;

export function KonohaMark({
  x,
  y,
  w,
  h,
  color = "#26343c",
}: {
  /** Kotak tujuan (koordinat induk): lambang dimuat penuh & dipusatkan di dalamnya. */
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}) {
  return (
    <svg x={x} y={y} width={w} height={h} viewBox={VIEW} preserveAspectRatio="xMidYMid meet" overflow="hidden">
      <g fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
        <path d="M445 135 L405 188 C350 168 285 165 240 205 C205 235 195 290 180 320 C160 360 130 390 108 408 L215 412 C300 418 380 420 420 385 C450 355 445 290 405 255 C365 225 300 232 272 275 C255 305 275 335 305 340 C335 345 350 325 345 300 C343 288 332 282 325 288" />
        <path d="M192 300 L213 408" />
      </g>
    </svg>
  );
}
