/**
 * Lambang kristal salju KomikFrost — emblem orisinal untuk ikat kepala & syal Yuki.
 *
 * Digambar di <svg> bersarang (viewBox 100×100, garis membulat tebal agar tetap
 * tegas di ukuran kecil). Beri kotak tujuan (x, y, w, h): lambang dipusatkan dan
 * tidak pernah keluar kotak. Tanpa ID → aman dirender berkali-kali.
 */
export function FrostMark({
  x,
  y,
  w,
  h,
  color = "#1d2a6b",
  stroke = 9,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  stroke?: number;
}) {
  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" overflow="hidden">
      <g fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {[0, 60, 120].map((a) => (
          <g key={a} transform={`rotate(${a} 50 50)`}>
            <path d="M50 10 V90" />
            <path d="M39 22 L50 32 L61 22" />
            <path d="M39 78 L50 68 L61 78" />
          </g>
        ))}
      </g>
      <circle cx={50} cy={50} r={stroke * 0.9} fill={color} />
    </svg>
  );
}
