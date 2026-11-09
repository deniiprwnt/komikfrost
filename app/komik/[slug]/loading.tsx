/**
 * Skeleton halaman detail komik. Ditampilkan Next.js seketika saat user
 * mengklik komik, menggantikan skeleton grid dari app/loading.tsx.
 * Bentuknya meniru skeleton client supaya tidak ada lompatan visual.
 */
const card =
  "rounded-3xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]";

export default function Loading() {
  return (
    <div className="space-y-4 px-4 pt-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat detail komik…</span>

      {/* Kartu utama: cover + judul + genre + sinopsis singkat */}
      <div className={card}>
        <div className="shimmer mx-auto h-40 w-[120px] rounded-2xl" />
        <div className="shimmer mt-5 h-[18px] w-[60px] rounded-full" />
        <div className="shimmer mt-3 h-[22px] w-[82%] rounded-full" />
        <div className="shimmer mt-3 h-[14px] w-[55%] rounded-full" />
        <div className="mt-3 flex gap-2">
          <div className="shimmer h-[22px] w-[60px] rounded-full" />
          <div className="shimmer h-[22px] w-[75px] rounded-full" />
          <div className="shimmer h-[22px] w-[52px] rounded-full" />
        </div>
        <div className="shimmer mt-3 h-3 w-[72%] rounded-full" />
        <div className="shimmer mt-2 h-3 w-[72%] rounded-full" />
        <div className="shimmer mt-2 h-3 w-[55%] rounded-full" />
        <div className="shimmer mt-2 h-3 w-[55%] rounded-full" />
      </div>

      {/* Kartu sinopsis */}
      <div className={card}>
        <div className="shimmer h-[18px] w-[105px] rounded-full" />
        <div className="shimmer mt-3 h-3 w-full rounded-full" />
        <div className="shimmer mt-2 h-3 w-full rounded-full" />
        <div className="shimmer mt-2 h-3 w-[70%] rounded-full" />
      </div>

      {/* Kartu daftar chapter */}
      <div className={card}>
        <div className="shimmer h-[18px] w-[135px] rounded-full" />
        <div className="shimmer mt-3 h-8 w-full rounded-2xl" />
        <div className="shimmer mt-2 h-8 w-full rounded-2xl" />
      </div>
    </div>
  );
}
