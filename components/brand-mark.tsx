/**
 * Tile logo KomikFrost: mark K putih di atas bidang teal solid (tanpa bloom,
 * tanpa kilau). Satu sumber visual untuk splash, header, dan halaman masuk.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[10%] bg-[#0b6b66] text-white ${className}`}
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
