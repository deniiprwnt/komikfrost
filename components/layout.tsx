"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme";
import { SearchSuggest } from "./search-suggest";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";
import { warmPrimaryNav } from "@/lib/nav-prefetch";

const NAV = [
  { href: "/", label: "Beranda", icon: IconHome },
  { href: "/terbaru", label: "Terbaru", icon: IconClock },
  { href: "/populer", label: "Peringkat", icon: IconFlame },
  { href: "/genre", label: "Genre", icon: IconTag },
  { href: "/riwayat", label: "Riwayat", icon: IconHistory },
  { href: "/favorit", label: "Favorit", icon: IconBookmark },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Logo mark: Rupture Panel — panel komik dibelah fracture kristalin, negative space membentuk K. */
function Mark() {
  return (
    <BrandMark className="h-9 w-9 transition-transform duration-200 group-hover/logo:scale-105" />
  );
}

/** Tombol X untuk mengosongkan pencarian; fokus kembali ke input. */
function ClearButton({ onClear, className = "" }: { onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label="Hapus pencarian"
      title="Hapus pencarian"
      className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-paper-3 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3 dark:hover:text-fg-dark ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const NAV_GROUPS = [
  { label: "Jelajah", items: NAV.slice(0, 4) },
  { label: "Koleksi", items: NAV.slice(4) },
] as const;

const SIDEBAR_BREAKPOINT = "(max-width: 1199px)";

/**
 * Sidebar desktop (md ke atas): navigasi utama + pencarian + tema.
 *
 * Mode "penuh" (17rem) atau "rail" (ikon saja, 4.75rem). Rail dipakai
 * otomatis di layar sempit (<1200px) dan saat membaca chapter; di layar
 * lebar bisa diciutkan manual (disimpan di localStorage). Lebar sidebar
 * dibagikan ke seluruh layout lewat `--sidebar-w` pada <html>, yang
 * di-set SEBELUM paint oleh skrip di layout.tsx — jadi tanpa kedip.
 * Pencarian & tema ada di header atas (lihat <Header />).
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const reading = pathname.startsWith("/baca/");
  const rail = collapsed || narrow || reading;

  // Baca preferensi + pantau lebar layar.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("bk-sidebar") === "1");
    } catch {}
    const mq = window.matchMedia(SIDEBAR_BREAKPOINT);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Bagikan lebar efektif ke layout (CSS var lewat atribut data).
  useEffect(() => {
    document.documentElement.dataset.sidebar = rail ? "rail" : "full";
  }, [rail]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("bk-sidebar", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const itemBase =
    "sb-item group/item relative flex h-12 w-full items-center rounded-2xl px-2.5 text-sm font-semibold transition-colors";
  const itemIdle =
    "text-muted hover:bg-paper-3/70 hover:text-fg dark:text-muted-dark dark:hover:bg-ink-3/70 dark:hover:text-fg-dark";
  const itemActive =
    "sb-active font-bold text-fg dark:text-white";

  return (
    <aside
      aria-label="Menu utama"
      className="sb glass fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-line md:flex dark:border-line-dark"
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-5">
        <NavLink href="/" className="group/logo flex min-w-0 items-center gap-3" aria-label="KomikFrost, ke beranda">
          <Mark />
          <span className="sb-wordmark truncate font-display text-xl font-extrabold tracking-tight text-fg dark:text-fg-dark">
            Komik<span className="text-accent">Frost</span>
          </span>
        </NavLink>
      </div>

      {/* Navigasi */}
      <nav className="sb-nav flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2" aria-label="Navigasi utama">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.label} className={`flex flex-col gap-1 ${gi > 0 ? "mt-3" : ""}`}>
            {gi > 0 && <div className="sb-divider" aria-hidden="true" />}
            <p className="sb-section-label">{g.label}</p>
            {g.items.map((n) => {
              const active = isActive(pathname, n.href);
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`${itemBase} ${active ? itemActive : itemIdle}`}
                >
                  <span className="sb-ico"><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="sb-label ml-3">{n.label}</span>
                  <span className="sb-tip" aria-hidden="true">{n.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Kartu info */}
      <div className="sb-foot mt-auto flex shrink-0 flex-col gap-2 p-3">
        <div className="sb-promo">
          <div className="sb-promo__head">
            <span className="sb-promo__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold leading-tight text-fg dark:text-fg-dark">Baca tanpa batas</p>
              <p className="sb-promo__live"><i aria-hidden="true" />Update tiap hari</p>
            </div>
          </div>
          <p className="mt-2.5 text-[11.5px] leading-snug text-muted dark:text-muted-dark">
            Komik terbaru dalam Bahasa Indonesia, langsung di satu tempat.
          </p>
          <div className="sb-promo__chips">
            <span className="sb-chip" style={{ ["--c" as string]: "var(--color-mark-manga)" }}>Manga</span>
            <span className="sb-chip" style={{ ["--c" as string]: "var(--color-mark-manhwa)" }}>Manhwa</span>
            <span className="sb-chip" style={{ ["--c" as string]: "var(--color-mark-manhua)" }}>Manhua</span>
          </div>
        </div>
      </div>

      {/* Handle ciut/perluas di tepi sidebar */}
      {!narrow && !reading && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          aria-pressed={collapsed}
          className="sb-handle"
        >
          <IconChevronLeft className="sb-chev h-3.5 w-3.5" />
        </button>
      )}
    </aside>
  );
}

/** Header: desktop = pencarian di tengah + tema (logo & menu di <Sidebar />); mobile = logo, cari, tema. */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [mobileSearch, setMobileSearch] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mobileFormRef = useRef<HTMLFormElement>(null);

  // Pintasan "/" untuk mencari (desktop, di luar kolom isian).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (window.innerWidth < 768) return;
      e.preventDefault();
      formRef.current?.querySelector("input")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Teks pencarian lama jangan kebawa: tiap pindah halaman
  // (masuk /cari, detail, dsb.) input dikosongkan + bar mobile ditutup.
  useEffect(() => {
    setQ("");
    setMobileSearch(false);
  }, [pathname]);

  // Panaskan data menu lain saat browser idle — tap menu di ponsel
  // langsung menampilkan isi, bukan skeleton yang terasa seperti reload.
  useEffect(() => {
    warmPrimaryNav(pathname);
  }, [pathname]);

  const clearSearch = (form: HTMLFormElement | null) => {
    setQ("");
    form?.querySelector("input")?.focus();
  };

  const submitSearch = () => {
    const kw = q.trim();
    if (!kw) return;
    setMobileSearch(false);
    setQ("");
    router.push(`/cari?q=${encodeURIComponent(kw)}`);
  };

  return (
    <header data-app-header className="sticky top-0 z-40 border-b border-line/50 glass pt-[calc(env(safe-area-inset-top,0px)+16px)] shadow-premium md:pt-[env(safe-area-inset-top,0px)] dark:border-line-dark/50">
      <div className="mx-auto flex h-14 max-w-app items-stretch gap-2 px-3 sm:gap-4 sm:px-4 md:grid md:h-14 md:grid-cols-[minmax(2.5rem,1fr)_minmax(0,28rem)_minmax(2.5rem,1fr)] md:items-center md:gap-4 lg:px-6">
        <NavLink href="/" className="group/logo flex min-w-0 shrink-0 items-center gap-2.5 md:hidden" aria-label="KomikFrost, ke beranda">
          <Mark />
          <span className="truncate font-display text-lg font-extrabold tracking-tight text-fg sm:text-xl dark:text-fg-dark">
            Komik<span className="text-accent">Frost</span>
          </span>
        </NavLink>

        {/* Desktop: pencarian di tengah (melebar halus saat fokus) + tema di kanan */}
        <div className="hidden md:block" aria-hidden="true" />
        <form
          ref={formRef}
          role="search"
          className="hdr-search search-wrap relative mx-auto hidden w-full min-w-0 items-center md:flex"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <IconSearch className="pointer-events-none absolute left-3.5 z-10 h-[18px] w-[18px] text-muted dark:text-muted-dark" />
          <SearchSuggest
            value={q}
            onChange={setQ}
            onSubmit={submitSearch}
            inputClassName="search-field h-10 w-full min-w-0 rounded-xl border border-line bg-paper-2 pl-10 pr-12 text-sm text-fg outline-none placeholder:text-muted dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
          />
          {!q && <kbd className="sb-kbd hdr-kbd pointer-events-none absolute right-3.5">/</kbd>}
          {q && <ClearButton onClear={() => clearSearch(formRef.current)} className="right-2.5" />}
        </form>
        <div className="hidden justify-end md:flex">
          <button
            onClick={toggle}
            aria-label="Ganti tema"
            title={theme === "dark" ? "Mode terang" : "Mode gelap"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-paper-2 text-fg transition-colors hover:border-accent hover:text-accent dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark"
          >
            {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
          <button
            onClick={() => setMobileSearch((v) => !v)}
            aria-label="Cari komik"
            aria-expanded={mobileSearch}
            className="flex h-10 w-10 items-center justify-center self-center rounded-xl border border-line bg-paper-2 text-fg dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark"
          >
            {mobileSearch ? (
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <IconSearch className="h-[18px] w-[18px]" />
            )}
          </button>
          <button
            onClick={toggle}
            aria-label="Ganti tema"
            className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl border border-line bg-paper-2 text-fg transition-colors hover:border-accent hover:text-accent dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark"
          >
            {theme === "dark" ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
      {/* Bar pencarian mobile — expand di bawah header, hasil dropdown
          langsung tanpa pindah halaman. */}
      {mobileSearch && (
        <div className="mx-auto max-w-app px-3 pb-3 sm:px-4 md:hidden">
          <form
            ref={mobileFormRef}
            className="search-wrap relative flex min-w-0 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <IconSearch className="pointer-events-none absolute left-3 z-10 h-4 w-4 text-muted dark:text-muted-dark" />
            <SearchSuggest
              value={q}
              onChange={setQ}
              onSubmit={submitSearch}
              autoFocus
              inputClassName="search-field h-11 w-full min-w-0 rounded-xl border border-line bg-paper-2 pl-9 pr-10 text-base text-fg outline-none placeholder:text-muted dark:border-line-dark dark:bg-ink-2 dark:text-fg-dark dark:placeholder:text-muted-dark"
            />
            {q && <ClearButton onClear={() => clearSearch(mobileFormRef.current)} className="right-2" />}
          </form>
        </div>
      )}
    </header>
  );
}

/** Wrapper for page content — trims bottom padding while reading, where the tab bar is hidden. */
export function Main({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reading = pathname.startsWith("/baca/");
  return (
    <main
      className={`mx-auto w-full max-w-app min-w-0 flex-1 px-3 pt-4 sm:px-4 sm:pt-6 sm:pb-6 lg:px-6 lg:pt-8 ${
        reading ? "pb-4" : "pb-28 md:pb-6"
      }`}
    >
      {!reading && <div aria-hidden className="scroll-progress" />}
      <div key={pathname} className="page-in min-w-0">
        {children}
      </div>
    </main>
  );
}

/**
 * Dock navigasi mobile: kapsul kaca melayang dengan 5 tujuan utama.
 * Indikator (pil aksen) meluncur mengikuti tab aktif, ikon aktif naik
 * sedikit, label tampil di semua tab agar jelas. Dock selalu tampil.
 * Riwayat ikut tab Favorit; Cari = tombol di header.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Beranda", icon: IconHome, match: ["/"] },
    { href: "/terbaru", label: "Terbaru", icon: IconClock, match: ["/terbaru"] },
    { href: "/populer", label: "Peringkat", icon: IconFlame, match: ["/populer"] },
    { href: "/genre", label: "Genre", icon: IconTag, match: ["/genre"] },
    { href: "/favorit", label: "Favorit", icon: IconBookmark, match: ["/favorit", "/riwayat"] },
  ];

  // Sembunyikan saat membaca chapter — halaman baca butuh layar penuh.
  if (pathname.startsWith("/baca/")) return null;

  const idx = items.findIndex((n) =>
    n.match.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m))),
  );

  return (
    <nav
      aria-label="Navigasi utama"
      className="dock-wrap pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 md:hidden"
    >
      <div className="dock pointer-events-auto relative mx-auto grid max-w-[24rem] grid-cols-5 rounded-2xl border border-line glass p-1.5 dark:border-line-dark">
        <span
          aria-hidden="true"
          className="dock-pill"
          style={{ transform: `translateX(${Math.max(idx, 0) * 100}%)`, opacity: idx < 0 ? 0 : 1 }}
        />
        {items.map((n, i) => {
          const active = i === idx;
          const Icon = n.icon;
          return (
            <NavLink
              key={n.href}
              href={n.href}
              aria-label={n.label}
              aria-current={active ? "page" : undefined}
              className={`dock-item relative z-10 flex h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl ${
                active ? "text-accent-strong dark:text-white" : "text-muted dark:text-muted-dark"
              }`}
            >
              <Icon className="dock-icon h-[22px] w-[22px] shrink-0" />
              <span className="max-w-full truncate px-0.5 text-[10px] font-bold leading-none tracking-tight">{n.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 hidden shrink-0 border-t border-line py-8 md:block dark:border-line-dark">
      <div className="mx-auto flex max-w-app items-start justify-between gap-10 px-4 lg:px-6">
        <p className="display-cond text-4xl text-fg dark:text-fg-dark">
          Komik<span className="text-accent">Frost</span>
        </p>
        <p className="max-w-md text-xs leading-relaxed text-muted dark:text-muted-dark">
          Judul, cover, sinopsis, chapter, dan peringkat dimuat langsung dari sumber eksternal.
          KomikFrost tidak menyimpan konten komik.
        </p>
      </div>
    </footer>
  );
}

/**
 * Tombol kembali-ke-atas global — tampil di SEMUA halaman (daftar, detail,
 * terbaru, genre…) setelah user scroll ke bawah (>600px).
 * Di halaman baca (/baca/…) tidak tampil karena reader punya tombolnya
 * sendiri agar tidak dobel.
 * Mobile: tombol disembunyikan saat sudah dekat ke bawah halaman
 * (<350px dari dasar) agar tidak menutupi pagination. Desktop tidak
 * berubah (tetap tampil seperti semula).
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 600) {
        setVisible(false);
        return;
      }
      // Mobile saja: sembunyikan saat pagination (di dasar konten)
      // sedang terlihat agar tombol melayang tidak menabraknya.
      if (window.innerWidth < 768) {
        const doc = document.documentElement;
        const distToBottom = doc.scrollHeight - y - window.innerHeight;
        setVisible(distToBottom > 350);
      } else {
        setVisible(true);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  if (pathname.startsWith("/baca/")) return null;
  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Kembali ke atas"
      className="fab-in group/fab fixed bottom-[calc(5.25rem+max(env(safe-area-inset-bottom,0px)_-_var(--dock-lift,26px),0px))] right-4 z-40 flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg bg-accent text-white transition-[transform,background-color] hover:bg-accent-strong active:scale-90 md:bottom-8 md:right-8"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 transition-transform duration-300 group-hover/fab:-translate-y-0.5">
        <path
          d="M12 19V5m0 0l-6 6m6-6l6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/* ------------------------------- Icons -------------------------------- */
type IconProps = { className?: string };

function IconHome({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.25v-5.25a1 1 0 0 0-1-1h-3.5a1 1 0 0 0-1 1V20H5a1 1 0 0 1-1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 7.5V12l3 1.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFlame({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12.5 3c.7 3.2 5.5 5.2 5.5 10.5a6 6 0 0 1-12 0c0-2.3.9-3.9 2-5 .1 1.8.9 2.9 2.2 3.2C9.4 8.6 10.6 5.4 12.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTag({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12.4 3.75h6.85a1 1 0 0 1 1 1v6.85a1 1 0 0 1-.29.7l-8.1 8.1a1 1 0 0 1-1.42 0l-6.85-6.85a1 1 0 0 1 0-1.42l8.1-8.1a1 1 0 0 1 .71-.28Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="8" r="1.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSearch({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="6.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m20 20-3.9-3.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHistory({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3.75 12a8.25 8.25 0 1 0 2.45-5.85L3.75 8.5M3.75 4v4.5h4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.75V12l3 1.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBookmark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M7 3.75h10a1.25 1.25 0 0 1 1.25 1.25v15.25L12 16.4l-6.25 3.85V5A1.25 1.25 0 0 1 7 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSun({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3v1.75M12 19.25V21M3 12h1.75M19.25 12H21M5.64 5.64l1.24 1.24M17.12 17.12l1.24 1.24M5.64 18.36l1.24-1.24M17.12 6.88l1.24-1.24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMoon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20 13.9A8 8 0 1 1 10.1 4a6.3 6.3 0 0 0 9.9 9.9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
