/**
 * Lambang spiral merah (cakram merah, tepi tinta, pusaran tinta) — vektor murni.
 *
 * Responsif & selalu pas: digambar di <svg> bersarang berviewBox persegi 1400×1400 dengan
 * `preserveAspectRatio="xMidYMid meet"`. Beri kotak tujuan (x, y, w, h): lambang diskalakan,
 * di-tengah-kan dan tidak pernah keluar kotak. Garis pusaran memakai ujung membulat dan
 * dibuat cukup tebal agar tetap tegas & halus di ukuran kecil. Tanpa ID → aman dirender
 * berkali-kali dalam satu halaman.
 */
const R = 700; // jari-jari luar (satuan viewBox)
const RING = 64; // tebal tepi tinta
const SPIRAL_W = 84; // tebal garis pusaran
const SPIRAL = "M672 748 C668.3 756.7 650.7 774.7 650 800 C649.3 825.3 649.7 870.8 668 900 C686.3 929.2 726.3 962.5 760 975 C793.7 987.5 833.3 986.7 870 975 C906.7 963.3 950.3 935.8 980 905 C1009.7 874.2 1038.0 834.2 1048 790 C1058.0 745.8 1054.7 687.5 1040 640 C1025.3 592.5 993.3 542.5 960 505 C926.7 467.5 883.3 435.0 840 415 C796.7 395.0 747.5 385.5 700 385 C652.5 384.5 601.7 394.5 555 412 C508.3 429.5 458.3 457.0 420 490 C381.7 523.0 346.7 565.0 325 610 C303.3 655.0 291.2 708.3 290 760 C288.8 811.7 299.7 868.3 318 920 C336.3 971.7 366.3 1025.8 400 1070 C433.7 1114.2 480.0 1152.5 520 1185 C560.0 1217.5 606.7 1240.8 640 1265 C673.3 1289.2 706.7 1319.2 720 1330";

export function UzumakiMark({
  x,
  y,
  w,
  h,
  ink = "#0d1518",
  red = "#ed1c24",
}: {
  /** Kotak tujuan (koordinat induk): lambang dimuat penuh & dipusatkan di dalamnya. */
  x: number;
  y: number;
  w: number;
  h: number;
  ink?: string;
  red?: string;
}) {
  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 1400 1400" preserveAspectRatio="xMidYMid meet" overflow="hidden">
      <circle cx={R} cy={R} r={R} fill={ink} />
      <circle cx={R} cy={R} r={R - RING} fill={red} />
      <path d={SPIRAL} fill="none" stroke={ink} strokeWidth={SPIRAL_W} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
