"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet } from "@/lib/client";
import { formatAgo } from "@/lib/relative-time";
import type { CommentItem, CommentsPayload, ComicSourceId, SourceComments } from "@/lib/api/types";
import { SourceBadge } from "@/components/cards";
import { PromoYukiHead } from "@/components/promo-yuki";

const LABEL: Record<ComicSourceId, string> = {
  shinigami: "Shinigami",
  komiku: "Komiku",
  komikcast: "Komikcast",
};

type Tab = "all" | ComicSourceId;
type Sort = "new" | "top";
const PAGE = 5;
/** Jumlah komentar per tahap di dalam modal. */
const MODAL_PAGE = 10;
/** Teks lebih panjang dari ini dilipat dengan tombol "Selengkapnya". */
const LONG = 280;

/* ------------------------------------------------------------------ */
/* Util kecil                                                           */
/* ------------------------------------------------------------------ */

function ago(ts?: number): string | undefined {
  return ts ? formatAgo(ts, Date.now()) : undefined;
}

function fullDate(ts?: number): string | undefined {
  if (!ts) return undefined;
  try {
    return new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return undefined;
  }
}

/** Warna latar inisial yang stabil per nama (sama di terang/gelap). */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/* ------------------------------------------------------------------ */
/* Ikon                                                                 */
/* ------------------------------------------------------------------ */

function IconHeart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 20.5s-7.5-4.6-9.4-9.3C1.4 8.1 3.1 4.9 6.3 4.5c2-.2 3.7.8 4.7 2.3l1 1.4 1-1.4c1-1.5 2.7-2.5 4.7-2.3 3.2.4 4.9 3.6 3.7 6.7-1.9 4.7-9.4 9.3-9.4 9.3Z" />
    </svg>
  );
}

function IconChevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${className} transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.2 3.4a.4.4 0 0 1-.65-.31V16H5.5A1.5 1.5 0 0 1 4 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar: foto profil, jatuh ke inisial berwarna bila gagal/tidak ada  */
/* ------------------------------------------------------------------ */

function Avatar({ name, src, size }: { name: string; src?: string; size: "md" | "sm" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const dim = size === "md" ? "h-10 w-10 text-sm" : "h-7 w-7 text-[11px]";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const showImg = !!src && !failed;
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2 ring-paper-2 dark:ring-ink-2 ${dim}`}
      style={{ backgroundColor: `hsl(${hueOf(name)} 42% 40%)` }}
    >
      {initial}
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Satu komentar                                                        */
/* ------------------------------------------------------------------ */

function CommentRow({ c, reply = false }: { c: CommentItem; reply?: boolean }) {
  const [openReplies, setOpenReplies] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const time = ago(c.createdAtTs);
  const n = c.replies?.length ?? 0;
  const long = c.text.length > LONG || c.text.split("\n").length > 5;

  return (
    <div className="flex min-w-0 gap-2.5 sm:gap-3">
      <Avatar name={c.author} src={c.avatar} size={reply ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        {/* Gelembung komentar */}
        <div className="rounded-2xl rounded-tl-md border border-line bg-paper px-3 py-2.5 dark:border-line-dark dark:bg-ink">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 max-w-full truncate text-[13px] font-bold text-fg sm:text-sm dark:text-fg-dark">
              {c.author}
            </span>
            <SourceBadge sources={[c.source]} />
            {time && (
              <time
                title={fullDate(c.createdAtTs)}
                className="text-[11px] text-muted dark:text-muted-dark"
              >
                {time}
              </time>
            )}
          </div>
          <p
            className={`mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-fg/90 sm:text-sm dark:text-fg-dark/85 ${
              long && !expanded ? "line-clamp-5" : ""
            }`}
          >
            {c.text}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-accent hover:underline"
            >
              {expanded ? "Ringkas" : "Selengkapnya"}
            </button>
          )}
        </div>

        {/* Aksi: like + balasan */}
        {(c.likes || n > 0) && (
          <div className="mt-1.5 flex items-center gap-3 pl-1 text-[11px] text-muted dark:text-muted-dark">
            {c.likes ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <IconHeart className="h-3.5 w-3.5 text-rose-500" />
                {c.likes}
              </span>
            ) : null}
            {n > 0 && (
              <button
                type="button"
                onClick={() => setOpenReplies((o) => !o)}
                aria-expanded={openReplies}
                className="inline-flex items-center gap-1 rounded-md py-0.5 font-semibold text-accent hover:underline"
              >
                <IconChevron open={openReplies} className="h-3.5 w-3.5" />
                {openReplies ? "Sembunyikan balasan" : `${n} balasan`}
              </button>
            )}
          </div>
        )}

        {openReplies && c.replies && (
          <div className="mt-2.5 space-y-2.5 border-l-2 border-line pl-3 dark:border-line-dark">
            {c.replies.map((r) => (
              <CommentRow key={r.id} c={r} reply />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-paper-3 dark:bg-ink-3" />
          <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-md border border-line bg-paper p-3 dark:border-line-dark dark:bg-ink">
            <div className="h-3 w-1/3 animate-pulse rounded bg-paper-3 dark:bg-ink-3" />
            <div className="h-3 w-full animate-pulse rounded bg-paper-3 dark:bg-ink-3" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-paper-3 dark:bg-ink-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Notice({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <PromoYukiHead mood="sad" className="h-14 w-auto sm:h-16" />
      <p className="max-w-xs text-sm text-muted dark:text-muted-dark">{text}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-line bg-paper px-4 py-1.5 text-xs font-semibold text-accent hover:border-accent active:scale-[0.97] dark:border-line-dark dark:bg-ink"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diagnosis: tampilkan penyebab sumber gagal (alamat yang dicoba+status) */
/* ------------------------------------------------------------------ */

function Diagnosis({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setCopied(false);
    try {
      const d = await apiGet<CommentsPayload>(`${path}${path.includes("?") ? "&" : "?"}debug=1`, { noStore: true });
      const dbg = d.debug;
      const lines: string[] = [];
      if (dbg) {
        lines.push(`slug: ${JSON.stringify(dbg.slugs)}`);
        if (dbg.chapterSources.length) lines.push(`chapter: ${dbg.chapterSources.join(" | ")}`);
      }
      for (const src of d.sources) {
        lines.push("", `[${src.source}] ${src.status}${src.message ? ` — ${src.message}` : ""}`);
        for (const t of dbg?.traces[src.source] ?? []) lines.push(`  ${t}`);
        if (!(dbg?.traces[src.source]?.length)) lines.push("  (tidak ada request: sumber tidak ditemukan untuk komik ini)");
      }
      setText(lines.join("\n"));
    } catch (e) {
      setText(e instanceof Error ? e.message : "Diagnosis gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && text === null) void run();
        }}
        className="text-[11px] font-semibold text-muted underline-offset-2 hover:text-accent hover:underline dark:text-muted-dark"
      >
        {open ? "Tutup diagnosis" : "Kenapa tidak muncul? Lihat diagnosis"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-paper p-3 dark:border-line-dark dark:bg-ink">
          {busy && <p className="text-xs text-muted dark:text-muted-dark">Memeriksa sumber…</p>}
          {text !== null && !busy && (
            <>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-fg/85 dark:text-fg-dark/80">
                {text}
              </pre>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
                  }}
                  className="rounded-lg border border-line px-3 py-1 text-[11px] font-semibold text-accent hover:border-accent dark:border-line-dark"
                >
                  {copied ? "Tersalin ✓" : "Salin"}
                </button>
                <button
                  type="button"
                  onClick={() => void run()}
                  className="rounded-lg border border-line px-3 py-1 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent dark:border-line-dark dark:text-muted-dark"
                >
                  Periksa ulang
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal semua komentar                                                 */
/* ------------------------------------------------------------------ */

function CommentsModal({
  title,
  count,
  items,
  onClose,
}: {
  title: string;
  count: number;
  items: CommentItem[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [limit, setLimit] = useState(MODAL_PAGE);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
    const prev = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      prev?.focus?.();
    };
  }, [close]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`cm-modal fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6 ${
        closing ? "cm-modal-out" : ""
      }`}
      role="presentation"
    >
      <div
        className="cm-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="cm-panel relative flex max-h-[68dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-paper-2 shadow-2xl outline-none sm:max-h-[80vh] sm:max-w-2xl sm:rounded-3xl dark:border-line-dark dark:bg-ink-2"
      >
        {/* Pegangan (mobile) */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line dark:bg-line-dark" />
        </div>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4 dark:border-line-dark">
          <IconChat className="h-5 w-5 shrink-0 text-accent" />
          <h3 className="display-cond min-w-0 flex-1 truncate text-lg text-fg dark:text-fg-dark">
            {title}
          </h3>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold tabular-nums text-accent dark:bg-accent-soft-dark">
            {count}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-muted transition hover:border-accent hover:text-accent active:scale-95 dark:border-line-dark dark:bg-ink dark:text-muted-dark"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="cm-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
          {items.slice(0, limit).map((c) => (
            <CommentRow key={`${c.source}:${c.id}`} c={c} />
          ))}
          {items.length > limit && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setLimit((n) => n + MODAL_PAGE)}
                className="rounded-full border border-line bg-paper px-5 py-2 text-xs font-semibold text-accent hover:border-accent active:scale-[0.97] dark:border-line-dark dark:bg-ink"
              >
                Muat lebih banyak ({items.length - limit})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Bagian komentar                                                      */
/* ------------------------------------------------------------------ */

/**
 * Komentar dari 3 sumber (Shinigami / Komiku / Komikcast) untuk halaman
 * detail (tanpa `chapter`) atau satu chapter (`chapter` = token URL).
 * Dimuat malas: request baru jalan saat bagian ini mendekati layar, jadi
 * tidak memperlambat detail/reader. Gagal = hanya bagian ini yang berubah.
 */
export function Comments({
  slug,
  chapter,
  className = "",
}: {
  slug: string;
  chapter?: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<CommentsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [shown, setShown] = useState(PAGE);
  const [modalOpen, setModalOpen] = useState(false);

  const path = `/api/comments/${encodeURIComponent(slug)}${
    chapter ? `?chapter=${encodeURIComponent(chapter)}` : ""
  }`;

  // Ganti komik/chapter → mulai dari awal.
  useEffect(() => {
    setData(null);
    setError(null);
    setTab("all");
    setSort("new");
    setShown(PAGE);
    setModalOpen(false);
    setVisible(false);
  }, [path]);

  // Muat malas saat mendekati viewport.
  useEffect(() => {
    if (visible) return;
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, path]);

  const load = useCallback(
    async (signal?: AbortSignal, fresh = false) => {
      setError(null);
      setData(null);
      try {
        const d = await apiGet<CommentsPayload>(path, {
          ...(signal ? { signal } : {}),
          ...(fresh ? { noStore: true } : {}),
        });
        if (!signal?.aborted) setData(d);
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof Error ? e.message : "Gagal memuat komentar.");
      }
    },
    [path],
  );

  useEffect(() => {
    if (!visible) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [visible, load]);

  const bySource = useMemo(() => {
    const m = new Map<ComicSourceId, SourceComments>();
    data?.sources.forEach((s) => m.set(s.source, s));
    return m;
  }, [data]);

  // Urutan dasar: bergilir antar sumber (komentar ke-1 tiap sumber, lalu ke-2, ...)
  // supaya komentar tanpa waktu pun tercampur, bukan menumpuk per sumber.
  const interleaved = useMemo(() => {
    const out: CommentItem[] = [];
    const lists = (data?.sources ?? []).map((s) => s.items);
    const max = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]!);
    return out;
  }, [data]);

  const rank = useMemo(() => {
    const m = new Map<CommentItem, number>();
    interleaved.forEach((c, i) => m.set(c, i));
    return m;
  }, [interleaved]);

  const sortList = useCallback(
    (items: CommentItem[]) =>
      [...items].sort((a, b) => {
        const byTime = (b.createdAtTs ?? 0) - (a.createdAtTs ?? 0);
        const byLike = (b.likes ?? 0) - (a.likes ?? 0);
        const tie = (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
        return sort === "top" ? byLike || byTime || tie : byTime || tie;
      }),
    [sort, rank],
  );

  // Tab "Semua" = komentar dari ketiga sumber sekaligus, terbaru dulu.
  const merged = useMemo(() => sortList(interleaved), [interleaved, sortList]);
  const total = (data?.sources ?? []).reduce((n, s) => n + s.items.length, 0);
  const list = useMemo(
    () => (tab === "all" ? merged : sortList(bySource.get(tab)?.items ?? [])),
    [tab, merged, bySource, sortList],
  );
  const current = tab === "all" ? null : bySource.get(tab);
  const failedSources = (data?.sources ?? []).filter((s) => s.status === "unavailable");
  const loading = visible && !data && !error;
  const retry = () => void load(undefined, true);

  return (
    <section
      ref={rootRef}
      aria-label="Komentar"
      className={`min-w-0 rounded-2xl border border-line bg-paper-2 p-3 sm:p-5 dark:border-line-dark dark:bg-ink-2 ${className}`}
    >
      {/* Kepala: judul + jumlah + urutan */}
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <h2 className="display-cond flex min-w-0 flex-1 items-center gap-2 text-xl text-fg dark:text-fg-dark">
          <IconChat className="h-5 w-5 shrink-0 text-accent" />
          <span className="truncate">Komentar</span>
          {data && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold tabular-nums text-accent dark:bg-accent-soft-dark">
              {total}
            </span>
          )}
        </h2>
        {data && list.length > 1 && (
          <div
            className="flex shrink-0 rounded-lg border border-line bg-paper p-0.5 text-[11px] font-semibold dark:border-line-dark dark:bg-ink"
            role="group"
            aria-label="Urutkan komentar"
          >
            {(
              [
                ["new", "Terbaru"],
                ["top", "Terpopuler"],
              ] as [Sort, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => {
                  setSort(k);
                  setShown(PAGE);
                }}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  sort === k
                    ? "bg-accent text-white"
                    : "text-muted hover:text-accent dark:text-muted-dark"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab sumber */}
      {data && (
        <div
          className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Sumber komentar"
        >
          {(["all", ...data.sources.map((s) => s.source)] as Tab[]).map((t) => {
            const count = t === "all" ? total : (bySource.get(t)?.items.length ?? 0);
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t);
                  setShown(PAGE);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-paper text-muted hover:border-accent hover:text-accent dark:border-line-dark dark:bg-ink dark:text-muted-dark"
                }`}
              >
                {t === "all" ? "Semua" : LABEL[t]}
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[10px] font-bold tabular-nums ${
                    active
                      ? "bg-white/25 text-white"
                      : "bg-paper-3 text-muted dark:bg-ink-3 dark:text-muted-dark"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!visible && <div className="h-24" aria-hidden />}
      {loading && <CommentsSkeleton />}
      {error && <Notice text={error} onRetry={retry} />}

      {data && list.length > 0 && (
        <>
          <div className="space-y-4">
            {list.slice(0, shown).map((c) => (
              <CommentRow key={`${c.source}:${c.id}`} c={c} />
            ))}
          </div>
          {list.length > shown && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-full border border-line bg-paper px-5 py-2 text-xs font-semibold text-accent hover:border-accent active:scale-[0.97] dark:border-line-dark dark:bg-ink"
              >
                Tampilkan lebih banyak ({list.length - shown})
              </button>
            </div>
          )}
          {modalOpen && (
            <CommentsModal
              title={tab === "all" ? "Semua komentar" : `Komentar ${LABEL[tab]}`}
              count={list.length}
              items={list}
              onClose={() => setModalOpen(false)}
            />
          )}
        </>
      )}

      {data && list.length === 0 && (
        <Notice
          text={
            tab === "all"
              ? failedSources.length === data.sources.length
                ? "Komentar belum bisa dimuat dari ketiga sumber."
                : "Belum ada komentar."
              : (current?.message ??
                (current?.status === "unavailable"
                  ? `Komentar ${LABEL[tab]} belum bisa dimuat.`
                  : `Belum ada komentar di ${LABEL[tab]}.`))
          }
          {...(failedSources.length > 0 ? { onRetry: retry } : {})}
        />
      )}

      {/* Tab "Semua": beri tahu sumber yang gagal tanpa menutupi sumber lain. */}
      {data && tab === "all" && list.length > 0 && failedSources.length > 0 && (
        <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-[11px] text-muted dark:bg-ink dark:text-muted-dark">
          Tidak dimuat: {failedSources.map((s) => LABEL[s.source]).join(", ")}.{" "}
          <button type="button" onClick={retry} className="font-semibold text-accent hover:underline">
            Coba lagi
          </button>
        </p>
      )}

      {data && failedSources.length > 0 && <Diagnosis path={path} />}
    </section>
  );
}
