import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";

/**
 * Yuki memegang papan untuk kartu info sidebar — gambar DIAM: tidak ada gerak
 * kepala/telapak/badan. Satu-satunya gerak: mata berkedip (lihat .sb-sign__eye). Dua bagian supaya urutan tumpukannya benar:
 *   <PromoYukiHead />  → kepala, DI BELAKANG papan (papan menutup dagu & syal)
 *   <PromoYukiPaw />   → telapak, DI DEPAN papan (jari mencengkeram tepi atas)
 * Tanpa <defs>/ID, aman dirender berkali-kali.
 */
const INK = "#0f2528";
const FUR = "#22b5a9";
const FUR_LIGHT = "#6fe6d8";
const FUR_SHADE = "#0e8580";
const CREAM = "#f6fdfb";

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
      <path d="M16 3c4 1.500 8 5 10.500 9L12 17c-.500-5 .500-9 4-14z" fill="#0b4e52" />
      <path d="M17 27c-3-6-3-11-1-16 5 3 8 9 9 16z" fill="#ffd3dc" />
      <path d="M13 31C9 20 11 11 16 3c9 4 15 13 16 27z" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </>
  );
  const eye = (cx: number) => (
    <g className="sb-sign__eye">
      <ellipse cx={cx} cy="38.500" rx="4.800" ry="6" fill={INK} />
      <ellipse cx={cx} cy="39.200" rx="3.900" ry="4.900" fill="#2aa3b0" />
      <ellipse cx={cx} cy="40.400" rx="2.100" ry="2.800" fill="#05222b" />
      <circle cx={cx - 1.600} cy="36.600" r="1.700" fill="#fff" />
      <circle cx={cx + 1.700} cy="41.200" r=".85" fill="#fff" opacity=".95" />
    </g>
  );
  return (
    <svg className={`${className}${sad ? " sb-cry" : ""}`} viewBox="0 0 64 68" aria-hidden="true" focusable="false">
      <g>{ear}</g>
      <g transform="translate(64 0) scale(-1 1)">{ear}</g>
      {/* rumbai pipi */}
      <path d="M12 41Q6 41 3.500 44.500Q7.500 45 8 47Q5 49 6.500 52Q11 52.500 15 51Z" fill={CREAM} stroke={INK} strokeWidth="1.900" strokeLinejoin="round" />
      <path d="M52 41Q58 41 60.500 44.500Q56.500 45 56 47Q59 49 57.500 52Q53 52.500 49 51Z" fill={CREAM} stroke={INK} strokeWidth="1.900" strokeLinejoin="round" />
      {/* kepala + muka krem */}
      <ellipse cx="32" cy="40" rx="24" ry="19" fill={FUR_SHADE} />
      <ellipse cx="30.500" cy="38.500" rx="23.400" ry="17.800" fill={FUR} />
      <ellipse cx="26" cy="31" rx="14" ry="6" fill={FUR_LIGHT} opacity=".4" />
      <path d="M9 43Q19 40 26 46Q30 49 32 49Q34 49 38 46Q45 40 55 43Q53 58 32 59Q11 58 9 43Z" fill={CREAM} />
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="none" stroke={INK} strokeWidth="2.200" />
      {/* wajah */}
      {eye(22)}
      {eye(42)}
      <ellipse cx="14" cy="47" rx="4.400" ry="2.500" fill="#ff8fa3" opacity=".55" />
      <ellipse cx="50" cy="47" rx="4.400" ry="2.500" fill="#ff8fa3" opacity=".55" />
      <path d="M29.800 43.200Q32 41.800 34.200 43.200Q33.400 45.800 32 46.200Q30.600 45.800 29.800 43.200Z" fill={INK} />
      {sad ? (
        <>
          <path d="M32 46.200v2.800M32 49q-3-.500-6 2.500M32 49q3-.500 6 2.500" fill="none" stroke={INK} strokeWidth="1.500" strokeLinecap="round" />
          <path d="M17.500 34.500 26 32.300M46.500 34.500 38 32.300" fill="none" stroke={INK} strokeWidth="1.700" strokeLinecap="round" />
          {/* air mata: menetes terus dari kedua mata (lihat .sb-tear di globals.css) */}
          <g transform="translate(19.500 43)">
            <path className="sb-tear" d="M0 0c-1.600 2.200-2.400 3.400-2.400 4.600a2.400 2.400 0 0 0 4.800 0c0-1.200-.8-2.400-2.400-4.600z" fill="#9fe0ff" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          </g>
          <g transform="translate(44.500 43)">
            <path className="sb-tear sb-tear--b" d="M0 0c-1.600 2.200-2.400 3.400-2.400 4.600a2.400 2.400 0 0 0 4.800 0c0-1.200-.8-2.400-2.400-4.600z" fill="#9fe0ff" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          </g>
        </>
      ) : (
        <>
          <path d="M32 46.200v2M32 48.200q-3 3.200-6 .3M32 48.200q3 3.200 6 .3" fill="none" stroke={INK} strokeWidth="1.500" strokeLinecap="round" />
        </>
      )}
      {/* ikat kepala Konoha */}
      <path d="M9 27 Q32 15.500 55 27 L54.500 32 Q32 22 9.500 32 Z" fill="#1f5fd6" stroke={INK} strokeWidth="1.300" strokeLinejoin="round" />
      <path d="M11 27 Q32 18 53 27" fill="none" stroke="#7aa6f5" strokeWidth="1.100" opacity=".8" />
      <rect x="21" y="20.200" width="22" height="11" rx="2.800" fill="#d9e4ec" stroke={INK} strokeWidth="1.600" />
      <rect x="22.600" y="21.500" width="18.800" height="8.400" rx="1.600" fill="none" stroke="#fff" strokeWidth=".7" opacity=".9" />
      <KonohaMark x={27} y={22} w={10} h={7.2} color="#26343c" />
      {/* syal */}
      <path d="M15 53C25 60 39 60 49 53l1.500 6L32 66.500 13.500 59z" fill="#1f5fd6" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
      <path d="M18 56C26 61 38 61 46 56" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".35" />
      <UzumakiMark x={28.500} y={58.200} w={7} h={7} />
    </svg>
  );
}

/** Kaki depan kucing/rubah/anjing yang bertumpu di tepi atas papan: telapak oval padat, empat jari pendek menyatu di tepi bawah (dipisah lekukan kecil), tanpa cakar. */
export function PromoYukiPaw({ className = "" }: { className?: string }) {
  const toes: [number, number, number, number][] = [
    [8.6, 17.2, 4, 3.6],
    [14, 19.4, 4.2, 3.8],
    [20, 19.4, 4.2, 3.8],
    [25.4, 17.2, 4, 3.6],
  ];
  return (
    <svg className={className} viewBox="0 0 34 30" aria-hidden="true" focusable="false">
      <g fill={INK} stroke={INK} strokeWidth="4.200" strokeLinejoin="round">
        <ellipse cx="17" cy="10" rx="12.600" ry="8.200" />
        {toes.map(([x, y, rx, ry]) => <ellipse key={x} cx={x} cy={y} rx={rx} ry={ry} />)}
      </g>
      <ellipse cx="17" cy="10" rx="12.600" ry="8.200" fill={FUR} />
      {toes.map(([x, y, rx, ry]) => <ellipse key={x} cx={x} cy={y} rx={rx} ry={ry} fill={FUR} />)}
      {/* bayangan lembut + kilau */}
      <path d="M5.600 12.400C11 16 23 16 28.400 12.400 27.600 15.600 22 16.600 17 16.600S6.400 15.600 5.600 12.400Z" fill={FUR_SHADE} opacity=".45" />
      <path d="M8.500 5.200C13 3 21 3 25.500 5.200" fill="none" stroke="#fff" strokeWidth="1.700" strokeLinecap="round" opacity=".55" />
      {/* lekukan pemisah jari */}
      <path d="M11.300 18.400L11.500 22M17 20.200V24M22.700 18.400L22.500 22" stroke={INK} strokeWidth="1.100" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}
