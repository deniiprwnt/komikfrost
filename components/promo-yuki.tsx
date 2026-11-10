import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";

/**
 * Yuki memegang papan untuk kartu info sidebar — gambar DIAM: tidak ada gerak
 * kepala/telapak/badan. Satu-satunya gerak: mata berkedip (lihat .sb-sign__eye). Dua bagian supaya urutan tumpukannya benar:
 *   <PromoYukiHead />  → kepala, DI BELAKANG papan (papan menutup dagu & syal)
 *   <PromoYukiPaw />   → telapak, DI DEPAN papan (jari mencengkeram tepi atas)
 * Tanpa <defs>/ID, aman dirender berkali-kali.
 */
const INK = "#0d1518";
const FUR = "#1a9a92";
const FUR_LIGHT = "#3cc0b4";
const FUR_SHADE = "#0b6b66";
const CREAM = "#eaf6f4";
const CREAM_SHADE = "#bfdedb";

export function PromoYukiHead({
  className = "",
  mood = "happy",
}: {
  className?: string;
  /** "happy" = ekspresi bawaan (sidebar). "sad" = alis turun, mulut melengkung ke bawah, setetes air mata (state kosong). */
  mood?: "happy" | "sad";
}) {
  const sad = mood === "sad";
  const ear = (
    <>
      <path d="M13 31C9 20 11 11 16 3c9 4 15 13 16 27z" fill={FUR} />
      <path d="M16 3c4 1.500 8 5 10.500 9L12 17c-.500-5 .500-9 4-14z" fill="#0a2f2d" />
      <path d="M17 27c-3-6-3-11-1-16 5 3 8 9 9 16z" fill={CREAM} />
      <path d="M13 31C9 20 11 11 16 3c9 4 15 13 16 27z" fill="none" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
    </>
  );
  const eye = (cx: number) => (
    <g className="sb-sign__eye">
      <ellipse cx={cx} cy="38" rx="3.900" ry="5" fill={INK} />
      <ellipse cx={cx} cy="39" rx="2.800" ry="3.400" fill="#16363a" />
      <circle cx={cx - 1.400} cy="36.400" r="1.250" fill="#fff" />
      <circle cx={cx + 1.400} cy="40.600" r=".6" fill="#fff" opacity=".9" />
    </g>
  );
  return (
    <svg className={`${className}${sad ? " sb-cry" : ""}`} viewBox="0 0 64 68" aria-hidden="true" focusable="false">
      <g>{ear}</g>
      <g transform="translate(64 0) scale(-1 1)">{ear}</g>
      {/* rumbai pipi */}
      <path d="M11 41 4.500 43.500 10 47 6.500 51 15 51Z" fill={CREAM} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M53 41 59.500 43.500 54 47 57.500 51 49 51Z" fill={CREAM} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {/* kepala + muka krem */}
      <ellipse cx="32" cy="40" rx="24" ry="19" fill={FUR_SHADE} />
      <ellipse cx="30" cy="38" rx="23.400" ry="17.600" fill={FUR} />
      <path d="M9 43Q19 40 26 46Q30 49 32 49Q34 49 38 46Q45 40 55 43Q53 58 32 59Q11 58 9 43Z" fill={CREAM} />
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="none" stroke={INK} strokeWidth="2.400" />
      {/* wajah */}
      {eye(22)}
      {eye(42)}
      <ellipse cx="14.500" cy="47" rx="3.600" ry="2" fill="#ff9aa2" opacity=".7" />
      <ellipse cx="49.500" cy="47" rx="3.600" ry="2" fill="#ff9aa2" opacity=".7" />
      <path d="M29.500 43Q32 41.500 34.500 43Q33.500 46 32 46.500Q30.500 46 29.500 43Z" fill={INK} />
      {sad ? (
        <>
          <path d="M32 48.500v1.500M32 50q-3-.500-6 2.500M32 50q3-.500 6 2.500" fill="none" stroke={INK} strokeWidth="1.600" strokeLinecap="round" />
          <path d="M17.500 35.500 26 33.300M46.500 35.500 38 33.300" fill="none" stroke={INK} strokeWidth="1.700" strokeLinecap="round" />
          {/* air mata: menetes terus dari kedua mata (lihat .sb-tear di globals.css) */}
          <g transform="translate(19.500 43)">
            <path className="sb-tear" d="M0 0c-1.600 2.200-2.400 3.400-2.400 4.600a2.400 2.400 0 0 0 4.800 0c0-1.200-.8-2.400-2.400-4.600z" fill="#8fd8f5" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          </g>
          <g transform="translate(44.500 43)">
            <path className="sb-tear sb-tear--b" d="M0 0c-1.600 2.200-2.400 3.400-2.400 4.600a2.400 2.400 0 0 0 4.800 0c0-1.200-.8-2.400-2.400-4.600z" fill="#8fd8f5" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          </g>
        </>
      ) : (
        <path d="M32 48.500v1.500M32 50q-3 3.500-6 .5M32 50q3 3.500 6 .5" fill="none" stroke={INK} strokeWidth="1.600" strokeLinecap="round" />
      )}
      {/* ikat kepala */}
      <path d="M9 27 Q32 15.500 55 27 L54.500 32 Q32 22 9.500 32 Z" fill="#0d4bb9" stroke={INK} strokeWidth="1.300" strokeLinejoin="round" />
      <path d="M11 27 Q32 18 53 27" fill="none" stroke="#2f6fe0" strokeWidth="1.100" opacity=".8" />
      <rect x="21" y="20.200" width="22" height="11" rx="2.400" fill="#cdd7de" stroke={INK} strokeWidth="1.600" />
      <rect x="22.600" y="21.500" width="18.800" height="8.400" rx="1.400" fill="none" stroke="#8d9ea9" strokeWidth=".65" />
      <KonohaMark x={27} y={22} w={10} h={7.2} color="#26343c" />
      {/* syal */}
      <path d="M15 53C25 60 39 60 49 53l1.500 6L32 66.500 13.500 59z" fill="#0d4bb9" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
      <UzumakiMark x={28.500} y={58.200} w={7} h={7} />
    </svg>
  );
}

/** Telapak rubah yang mencengkeram tepi atas papan (jari menjuntai ke depan papan). */
export function PromoYukiPaw({ className = "" }: { className?: string }) {
  const shapes = (
    <>
      <ellipse cx="17" cy="11" rx="12.500" ry="8.600" />
      <circle cx="9.800" cy="19.800" r="3.900" />
      <circle cx="17" cy="21" r="4.100" />
      <circle cx="24.200" cy="19.800" r="3.900" />
    </>
  );
  return (
    <svg className={className} viewBox="0 0 34 30" aria-hidden="true" focusable="false">
      <g fill={INK} stroke={INK} strokeWidth="5" strokeLinejoin="round">{shapes}</g>
      <g fill={FUR}>{shapes}</g>
      {/* bayangan sel + kilau */}
      <path d="M6 14.500C12 18.200 22 18.200 28 14.500 27 18 22 19.200 17 19.200S7 18 6 14.500Z" fill={FUR_SHADE} opacity=".65" />
      <path d="M9 5.800C13 3.600 21 3.600 25 5.800" fill="none" stroke={FUR_LIGHT} strokeWidth="2" strokeLinecap="round" opacity=".9" />
      {/* celah jari */}
      <path d="M13.400 18.200v3.400M20.600 18.200v3.400" stroke={INK} strokeWidth="1.600" strokeLinecap="round" />
      {/* bantalan telapak */}
      <path d="M13.500 9.600c0-2.600 2.200-3.400 3.500-3 1.400-.4 3.500.4 3.500 3 0 2.200-1.800 3-3.500 3s-3.500-.8-3.500-3Z" fill={CREAM_SHADE} opacity=".95" />
    </svg>
  );
}
