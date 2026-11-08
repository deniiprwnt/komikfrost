/**
 * Tile logo KomikFrost: mark K putih di atas gradien ink→teal dengan bloom
 * aksen. Satu sumber visual untuk splash, header, dan halaman masuk, agar
 * logo tidak lagi muncul sebagai kotak accent datar.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[22%] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ${className}`}
      style={{
        background:
          "radial-gradient(120% 120% at 76% 84%, rgba(30,143,120,0.45) 0%, rgba(22,120,102,0) 68%), linear-gradient(145deg, #1d3a3f 0%, #101d21 55%, #0a1417 100%)",
      }}
    >
      <svg viewBox="48 48 160 160" className="h-[78%] w-[78%]" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M64 64H124L96 128L124 192H64Z M156 64H192V192H156L128 128Z"
        />
      </svg>
    </span>
  );
}
