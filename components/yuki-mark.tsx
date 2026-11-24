/**
 * YukiMark — lambang kepala Yuki (rubah salju) untuk ukuran kecil: favicon,
 * ikon PWA, placeholder cover, kepala bagian kosong. Digambar geometris
 * (tanpa gradasi, tanpa bayangan) supaya tetap terbaca di 16px.
 *
 * Palet identitas tetap: bulu violet, muka krem, syal lavender. Satu warna tinta
 * tipis memegang siluet. Untuk Yuki penuh (8 ekspresi) pakai <Yuki>.
 */
const INK = "#0a0b0d";
const FUR = "#3f22b5";
const FUR_LIGHT = "#846fe6";
const FUR_SHADE = "#280e85";
const CREAM = "#f7f6fd";
const MINT = "#907fe3";
const BLUSH = "#ff8fa3";

export function YukiMark({
  className = "",
  /** Versi kusam untuk keadaan gagal (warna turun, tanpa kilau). */
  muted = false,
}: {
  className?: string;
  muted?: boolean;
}) {
  const fur = muted ? "#675f8a" : FUR;
  const furLight = muted ? "#958fb3" : FUR_LIGHT;
  const furShade = muted ? "#4a4364" : FUR_SHADE;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* telinga */}
      <path d="M13 30 15.5 6.5 33 20Z" fill={fur} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M51 30 48.5 6.5 31 20Z" fill={fur} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M17 25.5 18 13 27.5 20Z" fill={furLight} opacity={muted ? 0.5 : 0.85} />
      <path d="M47 25.5 46 13 36.5 20Z" fill={furLight} opacity={muted ? 0.5 : 0.85} />

      {/* kepala */}
      <path
        d="M32 13c-12.2 0-21 8-21 19.4C11 44.6 20.4 53 32 53s21-8.4 21-20.6C53 21 44.2 13 32 13Z"
        fill={fur}
        stroke={INK}
        strokeWidth="2.8"
      />
      {/* bayangan dasar */}
      <path d="M32 51c-9 0-16.4-5.6-18.6-13.4C17.6 44 24 48 32 48s14.4-4 18.6-10.4C48.4 45.4 41 51 32 51Z" fill={furShade} opacity=".55" />
      {/* muka krem */}
      <path
        d="M32 26.5c-7.6 0-13.2 4.2-13.2 10.6 0 6.6 5.9 11.4 13.2 11.4s13.2-4.8 13.2-11.4c0-6.4-5.6-10.6-13.2-10.6Z"
        fill={CREAM}
      />
      {/* mata */}
      <ellipse cx="24.4" cy="33.6" rx="3.3" ry="4.4" fill={INK} />
      <ellipse cx="39.6" cy="33.6" rx="3.3" ry="4.4" fill={INK} />
      {!muted && (
        <>
          <circle cx="23.4" cy="31.9" r="1.25" fill="#fff" />
          <circle cx="38.6" cy="31.9" r="1.25" fill="#fff" />
          <circle cx="25.6" cy="35.4" r=".7" fill="#fff" opacity=".8" />
          <circle cx="40.8" cy="35.4" r=".7" fill="#fff" opacity=".8" />
        </>
      )}
      {/* pipi */}
      <ellipse cx="18.6" cy="41.6" rx="3.1" ry="1.9" fill={BLUSH} opacity={muted ? 0.22 : 0.5} />
      <ellipse cx="45.4" cy="41.6" rx="3.1" ry="1.9" fill={BLUSH} opacity={muted ? 0.22 : 0.5} />
      {/* hidung + mulut */}
      <path d="M32 40.2l2.5 1.7-2.5 2-2.5-2z" fill={INK} />
      <path d="M32 44.4v1.5M32 45.9c-1.6 1.9-3 1.6-3.8.5M32 45.9c1.6 1.9 3 1.6 3.8.5" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
      {/* syal mint */}
      <path
        d="M17.5 49.6c4.4 3.3 9.4 5 14.5 5s10.1-1.7 14.5-5l1.2 6.1C42.6 58.9 37.4 60.6 32 60.6s-10.6-1.7-15.7-4.9z"
        fill={MINT}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M22 56.4l-1.6 5.2 4.6-1.4" fill={MINT} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}
