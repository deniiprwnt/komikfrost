"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, FocusEvent, MouseEvent, PointerEvent, TouchEvent } from "react";
import { warmRoute } from "@/lib/nav-prefetch";

type NavLinkProps = ComponentProps<typeof Link>;

/**
 * Link khusus menu utama.
 *
 * Navigasi tetap lewat router Next (client-side, tanpa reload dokumen),
 * tetapi data halaman tujuan ikut dipanaskan sejak hover/fokus/sentuh
 * pertama. Jadi saat menu ditekan, halaman tujuan langsung terisi dari
 * cache — bukan menampilkan skeleton panjang seperti reload.
 */
// `prefetch` default FALSE: prefetch otomatis Next (saat link masuk viewport)
// memicu RSC request + scrape untuk SETIAP menu yang terlihat, padahal
// sebagian besar tidak pernah dibuka. Prefetch tetap ada, tetapi HANYA dari
// niat user: hover, fokus keyboard, sentuh, atau pointerdown (handler di
// bawah). Itu yang dipertahankan.
export function NavLink({
  href,
  prefetch = false,
  onMouseEnter,
  onFocus,
  onTouchStart,
  onPointerDown,
  ...rest
}: NavLinkProps) {
  const router = useRouter();
  const path =
    typeof href === "string" ? href.split(/[?#]/)[0] : href.pathname ?? "";

  const warm = () => {
    if (typeof href === "string") {
      try {
        router.prefetch(href);
      } catch {
        // Prefetch route boleh gagal — navigasi tetap jalan.
      }
    }
    warmRoute(path);
  };

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        warm();
        onTouchStart?.(e);
      }}
      onPointerDown={(e: PointerEvent<HTMLAnchorElement>) => {
        warm();
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}
