import Link from "next/link";

/**
 * Halaman 404 global — tampil saat URL tidak cocok route mana pun
 * (mis. slug salah ketik). Tanpa data, tanpa fetch.
 */
export default function NotFound() {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 px-4 py-14 text-center sm:py-20">
      <p
        aria-hidden="true"
        className="font-display text-6xl font-extrabold text-accent sm:text-7xl"
      >
        404
      </p>
      <h1 className="font-display text-lg font-extrabold text-fg sm:text-xl dark:text-fg-dark">
        Halaman tidak ketemu
      </h1>
      <p className="max-w-sm text-sm text-muted dark:text-muted-dark">
        Alamatnya salah atau halamannya sudah tidak ada. Balik ke beranda dan
        cari judulnya dari sana.
      </p>
      <Link
        href="/"
        className="mt-1 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Kembali ke beranda
      </Link>
    </div>
  );
}
