// Regenerate PWA raster icons from the SVG sources.
// Usage: node scripts/generate-icons.mjs
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const jobs = [
  { src: "public/icons/icon.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/icon.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/icon.svg", out: "public/icons/icon-maskable-512.png", size: 512 },
  { src: "public/icons/icon.svg", out: "public/apple-touch-icon.png", size: 180 },
];

for (const { src, out, size } of jobs) {
  const svg = await readFile(src);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`${out} <- ${src} (${size}px)`);
}
