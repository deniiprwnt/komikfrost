#!/usr/bin/env python3
"""Generate PWA icons for KomikFrost.

Isi ikon: mark "Rupture Panel" saja (viewBox 48 48 160 160) — geometri yang
sama dipakai header, boot splash, dan /masuk. Tanpa wordmark: di ukuran
home screen teks tidak terbaca dan hanya jadi pita kabur.

Render: master 2048px (4x supersample) lalu LANCZOS downscale, supaya
diagonal kanal kristalin tidak bergerigi.

Jalankan: python scripts/gen-icons.py
Butuh: Pillow.
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"

ACCENT = "#0f8f79"
INK = "#ffffff"

# Mark "Rupture Panel" — dua panel komik dipisah kanal kristalin membentuk K.
MARK_VIEWBOX = (48, 48, 160)  # x, y, size
MARK_A = [(64, 64), (124, 64), (96, 128), (124, 192), (64, 192)]
MARK_B = [(156, 64), (192, 64), (192, 192), (156, 192), (128, 128)]

SS = 4  # supersample
BASE = 512  # ukuran logis master
MARK_SIZE = 384  # kotak viewBox; glyph-nya sendiri 80% -> ~60% tile


def draw_mark(d: ImageDraw.ImageDraw, x: float, y: float, size: float) -> None:
    """Gambar mark pada kotak (x, y, size) dalam koordinat master."""
    vx, vy, vs = MARK_VIEWBOX
    k = size / vs
    for poly in (MARK_A, MARK_B):
        pts = [(x + (px - vx) * k, y + (py - vy) * k) for px, py in poly]
        d.polygon(pts, fill=INK)


def render_master(content_scale: float = 1.0) -> Image.Image:
    """Master 2048x2048. content_scale < 1 = safe zone maskable."""
    W = BASE * SS
    img = Image.new("RGB", (W, W), ACCENT)
    size = MARK_SIZE * SS * content_scale
    draw_mark(ImageDraw.Draw(img), (W - size) / 2, (W - size) / 2, size)
    return img


def write_png(img: Image.Image, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).convert("RGB").save(
        path, "PNG", optimize=True
    )
    print(f"tulis {path.relative_to(ROOT)} ({size}x{size})")


def main() -> None:
    normal = render_master(content_scale=1.0)
    maskable = render_master(content_scale=0.75)

    write_png(normal, 512, ICONS / "icon-512.png")
    write_png(normal, 192, ICONS / "icon-192.png")
    write_png(normal, 180, PUBLIC / "apple-touch-icon.png")  # iOS: tanpa alpha
    write_png(maskable, 512, ICONS / "icon-maskable-512.png")

    # Pratinjau 48px (ukuran efektif home screen) diperbesar 4x untuk dicek.
    out = Path(os.environ.get("TEMP", "/tmp")) / "icon-48-preview.png"
    normal.resize((48, 48), Image.LANCZOS).resize((192, 192), Image.NEAREST).save(out)
    print(f"pratinjau 48px -> {out}")


if __name__ == "__main__":
    main()
