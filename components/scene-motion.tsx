"use client";

/**
 * Penggerak panel ilustrasi: Yuki menoleh mengikuti kursor/sentuhan, melirik
 * sendiri saat sepi, dan bereaksi (membal + kilau) ketika disentuh. Hanya
 * menulis variabel CSS --px/--py (−1…1) pada `.mg-scene`; seluruh gerak diurus
 * CSS. Mati total bila prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

export function SceneMotion() {
  const probe = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const scene = probe.current?.closest<HTMLElement>(".mg-scene");
    if (!scene) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 0, ty = 0, cx = 0, cy = 0;
    let raf = 0;
    let lastInput = 0;
    let glance = 0;
    let poke = 0;

    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    const tick = () => {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      scene.style.setProperty("--px", cx.toFixed(3));
      scene.style.setProperty("--py", cy.toFixed(3));
      raf = Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const go = (x: number, y: number) => {
      tx = clamp(x);
      ty = clamp(y);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const aim = (e: PointerEvent) => {
      lastInput = performance.now();
      const r = scene.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width * 1.2, 240);
      const dy = (e.clientY - (r.top + r.height * 0.4)) / Math.max(r.height * 1.2, 240);
      go(dx, dy);
    };

    // Saat tidak ada input, Yuki melirik ke sana-sini.
    const wander = () => {
      if (!document.hidden && performance.now() - lastInput > 2600) {
        const back = Math.random() < 0.35;
        go(back ? 0 : (Math.random() - 0.5) * 1.3, back ? 0 : (Math.random() - 0.5) * 0.6);
      }
      glance = window.setTimeout(wander, 1800 + Math.random() * 2600);
    };
    glance = window.setTimeout(wander, 1500);

    const onDown = (e: PointerEvent) => {
      aim(e);
      const yuki = scene.querySelector<HTMLElement>(".mg-yuki");
      if (!yuki || !yuki.contains(e.target as Node)) return;
      yuki.classList.remove("is-poked");
      void yuki.offsetWidth; // mulai ulang animasi
      yuki.classList.add("is-poked");
      window.clearTimeout(poke);
      poke = window.setTimeout(() => yuki.classList.remove("is-poked"), 900);
    };

    window.addEventListener("pointermove", aim, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aim);
      window.removeEventListener("pointerdown", onDown);
      window.clearTimeout(glance);
      window.clearTimeout(poke);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <span ref={probe} hidden />;
}
