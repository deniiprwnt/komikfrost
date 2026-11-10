"use client";

import { KonohaMark } from "@/components/konoha-mark";
import { UzumakiMark } from "@/components/uzumaki-mark";
import { useCallback, useState } from "react";

/**
 * Gambar cover dengan placeholder modern — pengganti <img> polos.
 *
 * - Loading : langit pastel + garis kecepatan manga, kilau bintang, kelopak sakura,
 *             maskot kelinci Yuki memantul + teks katakana (bukan kotak kosong).
 * - Error / tanpa src : ledakan garis kejut merah, Yuki lemas bermata spiral,
 *   huruf awal judul sebagai watermark, dan label (label otomatis disembunyikan
 *   pada thumbnail kecil lewat container query, jadi tetap rapi di semua ukuran).
 * - Gambar dimuat progresif (blur-up) DI ATAS placeholder, dan tidak pernah
 *   disembunyikan menunggu event `load`, jadi cover dari cache tetap langsung muncul.
 * - Gagal sekali → otomatis dicoba ulang satu kali (cache-bust) sebelum menyerah.
 *
 * Induk HARUS `relative` + punya ukuran (aspect-ratio / h-w); komponen ini
 * mengisi seluruh induk (`absolute inset-0`).
 */


/** Dekorasi bergaya anime: garis kecepatan. */
function Speed() {
  return <span className="cover-ph__speed" aria-hidden="true" />;
}
/**
 * Yuki (maskot rubah teal) versi ringkas untuk placeholder gambar.
 * Tanpa <defs>/ID — aman dirender puluhan kali di satu halaman (grid cover).
 * Varian "err": telinga terkulai + mata spiral pusing.
 */
function AnimeFace({ variant }: { variant: "load" | "err" }) {
  const INK = "#0f2528";
  const FUR = "#22b5a9";
  const err = variant === "err";
  const ear = (
    <>
      <path d="M13 31C9 20 11 11 16 3c9 4 15 13 16 27z" fill={FUR} />
      <path d="M16 3c4 1.500 8 5 10.500 9L12 17c-.500-5 .500-9 4-14z" fill="#0b4e52" />
      <path d="M17 27c-3-6-3-11-1-16 5 3 8 9 9 16z" fill="#ffd3dc" />
      <path d="M13 31C9 20 11 11 16 3c9 4 15 13 16 27z" fill="none" stroke={INK} strokeWidth="2.200" strokeLinejoin="round" />
    </>
  );
  const eye = (cx: number) => (
    <g className="ph-eye">
      <ellipse cx={cx} cy="38.500" rx="4.800" ry="6" fill={INK} />
      <ellipse cx={cx} cy="39.200" rx="3.900" ry="4.900" fill="#2aa3b0" />
      <ellipse cx={cx} cy="40.400" rx="2.100" ry="2.800" fill="#05222b" />
      <circle cx={cx - 1.600} cy="36.600" r="1.700" fill="#fff" />
      <circle cx={cx + 1.700} cy="41.200" r=".85" fill="#fff" opacity=".95" />
    </g>
  );
  return (
    <svg className="cover-ph__avatar" viewBox="0 0 64 68" aria-hidden="true">
      {/* telinga: sudut dan proporsi konsisten pada loading maupun error */}
      <g>{ear}</g>
      <g transform="translate(64 0) scale(-1 1)">{ear}</g>
      {/* rumbai pipi */}
      <path d="M12 41Q6 41 3.500 44.500Q7.500 45 8 47Q5 49 6.500 52Q11 52.500 15 51Z" fill="#f6fdfb" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M52 41Q58 41 60.500 44.500Q56.500 45 56 47Q59 49 57.500 52Q53 52.500 49 51Z" fill="#f6fdfb" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {/* kepala + muka krem */}
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="#0e8580" />
      <ellipse cx="30.500" cy="38.500" rx="23.400" ry="17.800" fill={FUR} />
      <ellipse cx="26" cy="31" rx="14" ry="6" fill="#6fe6d8" opacity=".4" />
      <path d="M9 43Q19 40 26 46Q30 49 32 49Q34 49 38 46Q45 40 55 43Q53 58 32 59Q11 58 9 43Z" fill="#f6fdfb" />
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="none" stroke={INK} strokeWidth="2.400" />
      {/* wajah */}
      {err ? (
        <g fill="#fff" stroke={INK} strokeWidth="1.800">
          <circle cx="22" cy="38" r="5.400" />
          <circle cx="42" cy="38" r="5.400" />
          <path className="ph-spiral" d="M22 38m-.8 0a.8.8 0 1 1 1.600 0a1.800 1.800 0 1 1-3.600 0a2.900 2.900 0 1 1 5.800 0" fill="none" strokeLinecap="round" />
          <path className="ph-spiral ph-spiral--r" d="M42 38m-.8 0a.8.8 0 1 1 1.600 0a1.800 1.800 0 1 1-3.600 0a2.900 2.900 0 1 1 5.800 0" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <>
          {eye(22)}
          {eye(42)}
        </>
      )}
      <ellipse cx="14" cy="47" rx="4.400" ry="2.500" fill="#ff8fa3" opacity=".55" />
      <ellipse cx="50" cy="47" rx="4.400" ry="2.500" fill="#ff8fa3" opacity=".55" />
      <path d="M29.500 43Q32 41.500 34.500 43Q33.500 46 32 46.500Q30.500 46 29.500 43Z" fill={INK} />
      {err ? (
        <path
          d="M27.2 52.4 C28.3 50.4 29.7 50.4 31 52.3 C32 53.9 33 53.9 34 52.3 C35.3 50.4 36.7 50.4 37.8 52.4"
          fill="none"
          stroke={INK}
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path d="M32 48.500v1.500M32 50q-3 3.500-6 .5M32 50q3 3.500 6 .5" fill="none" stroke={INK} strokeWidth="1.600" strokeLinecap="round" />
      )}
      {/* ikat kepala Konoha melengkung mengikuti dahi */}
      <path d="M9 27 Q32 15.5 55 27 L54.5 32 Q32 22 9.5 32 Z" fill="#1f5fd6" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M11 27 Q32 18 53 27" fill="none" stroke="#7aa6f5" strokeWidth="1.1" opacity=".8" />
      <rect x="21" y="20.2" width="22" height="11" rx="2.8" fill="#d9e4ec" stroke={INK} strokeWidth="1.6" />
      <rect x="22.6" y="21.5" width="18.8" height="8.4" rx="1.6" fill="none" stroke="#fff" strokeWidth=".7" opacity=".9" />
      <KonohaMark x={27} y={22} w={10} h={7.2} color="#26343c" />
      {/* syal */}
      <path d="M15 53C25 60 39 60 49 53l1.5 6L32 66.5 13.5 59z" fill="#1f5fd6" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <UzumakiMark x={28.5} y={58.2} w={7} h={7} />
    </svg>
  );
}

/** Isi placeholder loading (dipakai cover & halaman pembaca). */
function AnimeLoading({ text }: { text?: string }) {
  return (
    <>
      <Speed />
      <AnimeFace variant="load" />
      <span className="cover-ph__bar" aria-hidden="true" />
      <span className="cover-ph__label cover-ph__label--always">
        <span className="cover-ph__jp">読み込み中</span>
        {text && <span>{text}</span>}
      </span>
    </>
  );
}

/** Isi placeholder error. */
function AnimeError({ label }: { label: string }) {
  return (
    <>
      <Speed />
      <AnimeFace variant="err" />
      <span className="cover-ph__label">
        <span className="cover-ph__jp">画像なし</span>
        <span>{label}</span>
      </span>
    </>
  );
}

type Status = "loading" | "loaded" | "error";

/**
 * Anggaran "prioritas" per muat halaman: N cover pertama yang dirender
 * (praktis = yang terlihat di layar) dimuat eager + fetchpriority tinggi,
 * sisanya tetap lazy/low. Tanpa ini SEMUA cover memakai loading="lazy"
 * sehingga grid peringkat 11-20 baru terisi setelah browser menggulir.
 * Pemanggil tetap bisa memaksa prioritas lewat prop `priority`.
 */
const PRIORITY_BUDGET = 8;
let priorityLeft = PRIORITY_BUDGET;
let resetScheduled = false;

/**
 * Anggaran diisi ulang setelah batch render pertama selesai (satu kali per
 * pemuatan halaman), bukan sekali per umur modul.
 *
 * Dulu penghitung ini habis SEKALI untuk seluruh sesi SPA: begitu 8 cover
 * pertama memakainya, semua cover setelah navigasi berikutnya selalu
 * loading="lazy" â€” cover di layar baru menunggu browser memutuskan sendiri
 * kapan memuatnya ("8 dari 10 sampul masih placeholder"). Pengisian ulang
 * tertunda (bukan per frame) membuat cover yang dirender BERSAMAAN tetap
 * berbagi anggaran, sementara halaman berikutnya mendapat anggaran baru.
 */
function scheduleBudgetReset(): void {
  if (resetScheduled || typeof window === "undefined") return;
  resetScheduled = true;
  window.setTimeout(() => {
    priorityLeft = PRIORITY_BUDGET;
    resetScheduled = false;
  }, 120);
}

function claimPrioritySlot(): boolean {
  if (priorityLeft <= 0) return false;
  priorityLeft -= 1;
  scheduleBudgetReset();
  return true;
}

export function CoverImage({
  src,
  alt,
  className = "",
  priority = false,
  label = "Cover tidak tersedia",
  fallbackSrcs,
}: {
  src?: string | null;
  alt: string;
  /** Dipertahankan agar pemanggil lama tetap valid (tidak dipakai lagi). */
  title?: string;
  /** Kelas untuk <img> (object-fit, hover scale, dll). */
  className?: string;
  priority?: boolean;
  label?: string;
  /**
   * URL cover cadangan (sumber berikutnya) yang dicoba BERURUTAN bila cover
   * utama gagal dimuat. Kotak "Cover tidak tersedia" baru muncul setelah
   * semua kandidat gagal; tampilan kotaknya sendiri tidak berubah.
   */
  fallbackSrcs?: string[];
}) {
  // Rantai kandidat: cover utama dulu, lalu cadangan (dedupe, tanpa kosong).
  const candidates: string[] = [];
  for (const u of [src ?? "", ...(fallbackSrcs ?? [])]) {
    const v = (u ?? "").trim();
    if (v && !candidates.includes(v)) candidates.push(v);
  }
  const key = candidates.join("|");
  const initialStatus: Status = candidates.length > 0 ? "loading" : "error";
  const [st, setSt] = useState<{ key: string; i: number; status: Status }>({
    key,
    i: 0,
    status: initialStatus,
  });
  // Status terikat ke daftar kandidat: berubah = mulai lagi dari kandidat 0.
  const cur = st.key === key ? st : { key, i: 0, status: initialStatus };
  const status: Status = cur.status;
  const activeSrc =
    candidates.length > 0 ? candidates[Math.min(cur.i, candidates.length - 1)] : undefined;

  // Cover di layar (N pertama) dimuat eager; sisanya lazy.
  const [autoPriority] = useState(claimPrioritySlot);
  const eager = priority || autoPriority;

  const fail = useCallback(
    (el: HTMLImageElement) => {
      // Satu kali coba ulang per URL (kegagalan proxy sering sementara).
      if (activeSrc && el.dataset.retriedFor !== activeSrc) {
        el.dataset.retriedFor = activeSrc;
        el.src = `${activeSrc}${activeSrc.includes("?") ? "&" : "?"}r=${Date.now()}`;
        return;
      }
      setSt((prev) => {
        const base = prev.key === key ? prev : { key, i: 0, status: "loading" as Status };
        // Masih ada sumber lain? Pindah ke kandidat berikutnya.
        if (base.i + 1 < candidates.length) {
          return { key, i: base.i + 1, status: "loading" };
        }
        return { key, i: base.i, status: "error" };
      });
    },
    [activeSrc, key, candidates.length],
  );

  // Gambar yang sudah selesai SEBELUM React memasang onLoad (cache / hidrasi lambat).
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !el.complete) return;
      if (el.naturalWidth > 0) setSt({ key, i: cur.i, status: "loaded" });
      else fail(el);
    },
    [key, cur.i, fail],
  );

  return (
    <span className="cover-frame" data-status={status}>
      {status === "loading" && (
        <span className="cover-ph cover-ph--load" aria-hidden="true">
          <AnimeLoading />
        </span>
      )}

      {status === "error" ? (
        <span className="cover-ph cover-ph--err" role="img" aria-label={label}>
          <AnimeError label={label} />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={activeSrc ?? undefined}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          // decoding "async": decode di luar main thread. "sync" pada cover
          // eager menahan paint sehingga sampul lain di baris yang sama
          // terlambat muncul pada kunjungan pertama.
          decoding="async"
          fetchPriority={eager ? "high" : "low"}
          onLoad={() => setSt({ key, i: cur.i, status: "loaded" })}
          onError={(e) => fail(e.currentTarget)}
          className={`blur-up ${status === "loaded" ? "blur-done" : ""} ${className}`}
        />
      )}
    </span>
  );
}

/**
 * Halaman pembaca: placeholder besar bernomor halaman selama gambar dimuat
 * (mencegah layar kosong / lompatan tinggi), dan panel error dengan tombol
 * "Coba lagi" per halaman.
 */
export function ReaderPageImage({
  src,
  alt,
  index,
  priority = false,
  mode = "scroll",
  onFail,
  onClick,
  imgClassName = "",
}: {
  src: string;
  alt: string;
  index: number;
  priority?: boolean;
  mode?: "scroll" | "page";
  onFail: () => void;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  const fail = useCallback(
    (el: HTMLImageElement) => {
      // Gambar lewat proxy: kegagalan upstream sering sementara. Coba sekali lagi.
      if (src.startsWith("/api/img") && !el.dataset.retried) {
        el.dataset.retried = "1";
        el.src = `${src}&r=${Date.now()}`;
        return;
      }
      // Fallback Komiku: imageN.komiku.to → img.komiku.org
      const alt2 = src.replace(/image\d+\.komiku\.to/i, "img.komiku.org");
      if (alt2 !== src && !el.dataset.fb) {
        el.dataset.fb = "1";
        el.src = alt2;
        return;
      }
      onFail();
    },
    [src, onFail],
  );

  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !el.complete) return;
      if (el.naturalWidth > 0) setLoaded(true);
      else fail(el);
    },
    [fail],
  );

  return (
    <div
      data-pg={index}
      className={`reader-frame relative ${loaded ? "" : mode === "scroll" ? "reader-frame--loading" : "reader-frame--loading-page"}`}
    >
      {!loaded && (
        <div className="cover-ph cover-ph--load cover-ph--reader" aria-hidden="true">
          <AnimeLoading text={`Memuat halaman ${index + 1}…`} />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={index === 0 ? "high" : index < 3 ? "auto" : "low"}
        decoding={index < 3 ? "sync" : "async"}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={(e) => fail(e.currentTarget)}
        onClick={onClick}
        className={`reader-img ${loaded ? "is-loaded" : ""} relative z-[1] ${imgClassName}`}
      />
    </div>
  );
}

/** Panel error satu halaman pembaca (menggantikan teks polos). */
export function ReaderPageError({
  index,
  message,
  onRetry,
}: {
  index: number;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="cover-ph cover-ph--err cover-ph--reader-err" role="alert">
      <Speed />
      <AnimeFace variant="err" />
      <span className="cover-ph__label cover-ph__label--always">
        <span className="cover-ph__jp">画像なし</span>
        <span>{message ?? `Halaman ${index + 1} gagal dimuat`}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="relative min-h-11 touch-manipulation rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-transform active:scale-[0.97]"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}
