"use client";

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
 * Yuki (maskot kelinci salju) versi ringkas untuk placeholder gambar.
 * Tanpa <defs>/ID — aman dirender puluhan kali di satu halaman (grid cover).
 * Varian "err": telinga terkulai + mata spiral pusing.
 */
function AnimeFace({ variant }: { variant: "load" | "err" }) {
  const INK = "#0d1518";
  const err = variant === "err";
  const ear = (
    <>
      <path d="M21 28C13 22 11 9 16 2c8 4 13 14 13 27z" fill="#fff" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M21 24c-4-5-5-11-3-15 4 3 7 9 7 16z" fill="#7fe3d6" />
    </>
  );
  const eye = (cx: number) => (
    <g className="ph-eye">
      <ellipse cx={cx} cy="38" rx="4.2" ry="5.6" fill={INK} />
      <ellipse cx={cx} cy="39" rx="3.1" ry="4.3" fill="#1fb3a8" />
      <ellipse cx={cx} cy="38.4" rx="1.7" ry="2.7" fill={INK} />
      <circle cx={cx - 1.2} cy="36" r="1.4" fill="#fff" />
    </g>
  );
  return (
    <svg className="cover-ph__avatar" viewBox="0 0 64 68" aria-hidden="true">
      {/* telinga */}
      <g transform={err ? "rotate(-38 24 30)" : "rotate(-4 24 30)"}>{ear}</g>
      <g transform="translate(64 0) scale(-1 1)">
        <g transform={err ? "rotate(-38 24 30)" : "rotate(-4 24 30)"}>{ear}</g>
      </g>
      {/* kepala + bayangan */}
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="#cfe5e2" />
      <ellipse cx="30" cy="38" rx="23.4" ry="17.6" fill="#fff" />
      <ellipse cx="32" cy="40" rx="24" ry="19" fill="none" stroke={INK} strokeWidth="2.4" />
      {/* wajah */}
      {err ? (
        <g fill="#fff" stroke={INK} strokeWidth="1.8">
          <circle cx="22" cy="38" r="5.4" />
          <circle cx="42" cy="38" r="5.4" />
          <path className="ph-spiral" d="M22 38m-.8 0a.8.8 0 1 1 1.6 0a1.8 1.8 0 1 1-3.6 0a2.9 2.9 0 1 1 5.8 0" fill="none" strokeLinecap="round" />
          <path className="ph-spiral ph-spiral--r" d="M42 38m-.8 0a.8.8 0 1 1 1.6 0a1.8 1.8 0 1 1-3.6 0a2.9 2.9 0 1 1 5.8 0" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <>
          {eye(22)}
          {eye(42)}
        </>
      )}
      <ellipse cx="14.500" cy="46" rx="3.600" ry="2" fill="#ff9aa2" opacity=".7" />
      <ellipse cx="49.500" cy="46" rx="3.600" ry="2" fill="#ff9aa2" opacity=".7" />
      {err ? (
        <path d="M27 49q2.500-2.500 5 0t5 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M29 47.500q3 3 6 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {/* syal */}
      <path d="M16 54C25 62 39 62 48 54l1.500 6c-9 7-24 7-35 0z" fill="#118079" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
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

export function CoverImage({
  src,
  alt,
  className = "",
  priority = false,
  label = "Cover tidak tersedia",
}: {
  src?: string | null;
  alt: string;
  /** Dipertahankan agar pemanggil lama tetap valid (tidak dipakai lagi). */
  title?: string;
  /** Kelas untuk <img> (object-fit, hover scale, dll). */
  className?: string;
  priority?: boolean;
  label?: string;
}) {
  // Status terikat ke src: bila src berubah, otomatis kembali ke "loading".
  const [st, setSt] = useState<{ src?: string | null; status: Status }>({ src, status: "loading" });
  const status: Status = !src ? "error" : st.src === src ? st.status : "loading";
  const set = useCallback((s: Status) => setSt({ src, status: s }), [src]);

  const fail = useCallback(
    (el: HTMLImageElement) => {
      if (src && !el.dataset.retried) {
        el.dataset.retried = "1";
        el.src = `${src}${src.includes("?") ? "&" : "?"}r=${Date.now()}`;
        return;
      }
      set("error");
    },
    [src, set],
  );

  // Gambar yang sudah selesai SEBELUM React memasang onLoad (cache / hidrasi lambat).
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !el.complete) return;
      if (el.naturalWidth > 0) set("loaded");
      else fail(el);
    },
    [set, fail],
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
          src={src ?? undefined}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "low"}
          onLoad={() => set("loaded")}
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
