/**
 * Cover morph list → detail (overdrive).
 * Modul singleton sisi-klien: menangkap posisi + sumber gambar cover saat
 * kartu diklik, lalu halaman detail mengonsumsinya untuk animasi FLIP.
 * Tanpa dependensi — murni Web Animations API + CSS, jadi fallback di
 * browser lama = navigasi normal tanpa animasi.
 */

export interface CoverMorph {
  slug: string;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  at: number;
}

let pending: CoverMorph | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Dipanggil saat kartu diklik — simpan rect <img> cover sebelum pindah. */
export function captureCoverMorph(slug: string, article: HTMLElement | null): void {
  if (!article || prefersReducedMotion()) return;
  const img = article.querySelector("img");
  if (!(img instanceof HTMLImageElement) || !img.currentSrc) return;
  const r = img.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return;
  pending = { slug, x: r.left, y: r.top, w: r.width, h: r.height, src: img.currentSrc, at: Date.now() };
}

/** Dipakai halaman detail — ambil bila klik baru saja terjadi (< 10 dtk),
 * lalu hanguskan agar tidak terputar ulang saat kembali via cache. */
export function consumeCoverMorph(slug: string): CoverMorph | null {
  if (pending?.slug !== slug) return null;
  const m = pending;
  pending = null;
  if (Date.now() - m.at > 10_000) return null;
  return m;
}

/**
 * Terbangkan clone cover dari rect asal ke hero tujuan.
 * Mengembalikan promise yang selesai saat animasi tamat (atau langsung
 * selesai bila elemen tidak valid). Target dibuat transparan selama
 * terbang agar tidak dobel, lalu dinyalakan lagi di akhir.
 */
export function flyCover(
  morph: CoverMorph,
  target: HTMLElement,
  durationMs = 420,
): Promise<void> {
  return new Promise((resolve) => {
    const dest = target.getBoundingClientRect();
    if (dest.width < 8 || dest.height < 8) {
      resolve();
      return;
    }
    const ghost = document.createElement("img");
    ghost.src = morph.src;
    ghost.alt = "";
    ghost.setAttribute("aria-hidden", "true");
    const sx = morph.w / dest.width;
    const sy = morph.h / dest.height;
    const dx = morph.x - dest.left;
    const dy = morph.y - dest.top;
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${dest.left}px`,
      top: `${dest.top}px`,
      width: `${dest.width}px`,
      height: `${dest.height}px`,
      objectFit: "cover",
      borderRadius: "18px",
      zIndex: "60",
      pointerEvents: "none",
      margin: "0",
      maxWidth: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    target.style.opacity = "0";
    document.body.appendChild(ghost);
    const anim = ghost.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: "18px", opacity: 1 },
        { transform: "translate(0, 0) scale(1, 1)", borderRadius: "18px", opacity: 1 },
      ],
      { duration: durationMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
    );
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      anim.cancel();
      ghost.remove();
      target.style.opacity = "";
      // Masuk lembut pasca-mendarat — hero "tercetak" ke tempatnya.
      target.animate(
        [
          { opacity: 0.35, transform: "scale(0.985)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      resolve();
    };
    anim.onfinish = done;
    // Pengaman: animasi Web Animations kadang tidak finish saat tab hidden.
    window.setTimeout(done, durationMs + 120);
  });
}

/**
 * Bungkus update state dalam View Transition (skeleton → konten) bila
 * didukung. Fallback = jalankan langsung.
 */
export function transitionUpdate(fn: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  if (prefersReducedMotion() || typeof doc.startViewTransition !== "function") {
    fn();
    return;
  }
  try {
    doc.startViewTransition(fn);
  } catch {
    fn();
  }
}
