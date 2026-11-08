"use client";

import { useCallback, useState } from "react";

/**
 * Gambar cover dengan placeholder modern — pengganti <img> polos.
 *
 * - Loading : langit pastel + garis kecepatan manga, kilau bintang, kelopak sakura,
 *             wajah kaomoji memantul + teks katakana (bukan kotak kosong).
 * - Error / tanpa src : ledakan garis kejut merah, wajah kaomoji lemas,
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
 * Karakter anime orisinal (SVG, tanpa teks): rambut berponi, mata besar
 * berkilau yang berkedip, pipi merona. Varian "error": mata spiral pusing. Warna ikut tema lewat variabel CSS.
 */
function AnimeFace({ variant }: { variant: "load" | "err" }) {
  const id = variant === "load" ? "ph-iris-l" : "ph-iris-e";
  return (
    <svg className="cover-ph__avatar" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ph-iris-a)" />
          <stop offset="1" stopColor="var(--ph-iris-b)" />
        </linearGradient>
      </defs>
      {/* rambut belakang */}
      <path d="M9 38C7 16 22 6 33 6s26 9 22 32c-1 7-3 12-6 15l-3-12H18l-3 12c-3-3-5-8-6-15z" fill="var(--ph-hair)" />
      {/* wajah */}
      <ellipse cx="32" cy="38" rx="19" ry="18" fill="var(--ph-skin)" />
      {/* poni */}
      <path d="M12 36C11 17 26 10 34 10c12 0 21 9 18 26-3-8-8-12-14-13-1 5-6 9-12 8-4-1-7-4-9-1-2 2-3 4-5 6z" fill="var(--ph-hair)" />
      <path d="M22 14c5-3 12-3 17 0" stroke="var(--ph-hair-hi)" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".75" />
      {/* aho (ahoge) */}
      <path d="M33 8c-1-5 2-8 6-8-2 2-2 5-1 8z" fill="var(--ph-hair)" />
      {variant === "load" ? (
        <>
          <g className="ph-eye">
            <ellipse cx="24" cy="39" rx="4.6" ry="6" fill="#1a1e33" />
            <ellipse cx="24" cy="40" rx="3.5" ry="5" fill={`url(#${id})`} />
            <circle cx="22.4" cy="37" r="1.7" fill="#fff" />
            <circle cx="25.6" cy="42" r="0.9" fill="#fff" />
          </g>
          <g className="ph-eye">
            <ellipse cx="40" cy="39" rx="4.6" ry="6" fill="#1a1e33" />
            <ellipse cx="40" cy="40" rx="3.5" ry="5" fill={`url(#${id})`} />
            <circle cx="38.4" cy="37" r="1.7" fill="#fff" />
            <circle cx="41.6" cy="42" r="0.9" fill="#fff" />
          </g>
          <path d="M29 48.5q3 3 6 0" stroke="#c4566e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <g stroke="#1a1e33" strokeWidth="1.5" strokeLinecap="round" fill="none">
            <path className="ph-spiral" d="M24 39m-1 0a1 1 0 1 1 2 0a3 3 0 1 1-4-2.8a5 5 0 1 1 6 6" />
            <path className="ph-spiral ph-spiral--r" d="M40 39m-1 0a1 1 0 1 1 2 0a3 3 0 1 1-4-2.8a5 5 0 1 1 6 6" />
          </g>
          <path d="M28 49q2-2 4 0t4 0" stroke="#c4566e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      )}
      {/* pipi merona */}
      <ellipse cx="17.500" cy="46" rx="3.600" ry="2" fill="#ff8fa8" opacity=".55" />
      <ellipse cx="46.500" cy="46" rx="3.600" ry="2" fill="#ff8fa8" opacity=".55" />
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
