---
version: beta
name: KomikFrost
description: Indonesian manga-reader aggregator. Editorial, cover-first, quiet surfaces, one deep teal accent.
colors:
  primary: "#0C7168"
  primary-strong: "#085A53"
  primary-soft: "#D7EEEA"
  primary-on-dark: "#66DCCB"
  paper: "#F3F6F5"
  paper-raised: "#FFFFFF"
  paper-sunken: "#E8EEED"
  line: "#DCE3E2"
  ink: "#080E11"
  ink-2: "#0E171B"
  ink-3: "#152227"
  line-dark: "#1F2E34"
  fg: "#0C1413"
  fg-dark: "#E9F0F0"
  muted: "#56676A"
  muted-dark: "#8FA3A8"
  gold: "#A9710F"
  gold-dark: "#E3B54F"
  mark-manga: "#B94A43"
  mark-manhwa: "#2C68A6"
  mark-manhua: "#8F6112"
typography:
  section-title:
    fontFamily: Archivo
    fontSize: 1.3rem to 1.9rem (responsive)
    fontWeight: 700
    letterSpacing: "-0.03em"
  body:
    fontFamily: Figtree
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: Figtree
    fontSize: 0.6875rem to 0.75rem
    fontWeight: 400
rounded:
  desktop: "2px to 8px scale, controls and covers 4-5px"
  android: "controls 12px, pills 14px, covers 12px"
  ios: "controls 14px, pills full, covers 14px"
---

## Overview

KomikFrost is a personal Indonesian manga/manhwa/manhua reader aggregator.
The covers are the content. Everything else (chrome, borders, labels) steps
back so a returning reader can scan rankings and updates quickly.

The mascot (Yuki) is a fixed brand element. Its components and CSS
(`.sb-sign*`, `.mg-*`, `.yk-*`, `.sx-*`, `.cover-ph*`) are not part of this
system and are never restyled by it.

## Files

Styles load in this order from `app/layout.tsx`:

1. `globals.css`: Tailwind tokens, base styles, mascot and status screens.
2. `design.css`: structure (section heads, rank rows, cover tiles, flat
   header, sidebar icons, dock).
3. `theme.css`: refined light/dark palette and responsive sizing.
4. `radius.css`: per-platform radius scale.

`premium.css`, `modern.css` and `screens.css` are not imported anywhere and
are leftovers from earlier experiments.

## Colors

- **Primary teal (#0C7168):** the single interaction color, flat, never a
  gradient. On dark surfaces, accent text uses #66DCCB and filled accents
  keep #118079 so white text stays readable.
- **Neutrals:** near-neutral with a faint green cast. Light uses #F3F6F5
  paper with white raised surfaces; dark uses #080E11 ink, deliberately
  unchanged because the PWA splash and `theme-color` depend on it.
- **Gold:** rank 1-3 only. Ranks 4+ are muted so the top three mean something.
- **Type marks:** manga red, manhwa blue, manhua amber. One color per
  reading origin, learned once.
- **Source badges** reuse the same hues instead of inventing new ones.

`theme-color` meta values (`app/layout.tsx`, `components/theme.tsx`) must
match the paper color: #F3F6F5 light, #080E11 dark.

## Typography

- **Archivo, weight 700, tight tracking** for section titles, the wordmark
  and rank numbers.
- **Figtree** for body and meta. Titles 13px semibold, meta 11-12px muted.
- No uppercase labels with wide tracking; no monospace display type.

## Layout

- **Cover first:** grid cards have no box. The cover (rounded, with a 1px
  inner hairline) sits on the page, title and meta directly below.
- **List surfaces are not wrapped in panels.** Ranking rows and list cards
  are separated by hairlines, not nested boxes.
- **Rank rows** carry a large tabular number (gold for 1-3), cover, title,
  genre, views and latest chapter.
- **Detail page:** cover and info side by side, synopsis and chapter list
  without frames; the chapter list is sticky on desktop.
- **Reader (`/baca`):** the page images carry the screen. Chrome is a thin
  progress bar, a title block, small bordered control groups (mode, zoom),
  chapter nav bars and a chapter dropdown, all flat with hairlines. Controls
  use `--r-ctl`, the image column uses `--r-cover`, and nav bars are
  concentric (`--r-ctl` plus their padding). Only the floating tap-nav, the
  settings popover and the back-to-top button leave the page.
- **Mobile** uses a floating dock for the main destinations; desktop uses a
  sidebar that collapses to a rail.

## Shapes

Radius depends on `<html data-platform>`, set before first paint:

- **Desktop:** tight. Tailwind's `rounded-sm` to `rounded-3xl` map to
  2-8px; covers and controls are 4-5px.
- **Android:** medium. Controls 12px, pills 14px, dock 20px.
- **iOS:** soft. Controls 14px, pills fully round, dock 26px.

Preview on desktop with `/?platform=ios`, `/?platform=android`,
`/?platform=desktop`; `/?platform=auto` clears the choice. Elements that
need a fixed shape use `--r-cover`, `--r-ctl`, `--r-pill`, `--r-dock`
rather than hard-coded values.

## Elevation

Flat. Hairline borders, no page-wide shadow, blur or glow. Elevation is
reserved for things that leave the page: the mobile dock, dropdown
popovers and reader overlays.

## Components

- `section-title` + `section-head`: display title over a single hairline;
  "Lihat semua" is a quiet accent link with a CSS arrow.
- `cover-tile`: rounded cover with an inner hairline.
- `rank-row` / `rank-num`: editorial ranking row.
- Pills (pagination, filter dropdowns, period tabs, genre chips) use
  `--r-pill`.
- One high-emphasis accent button per decision point (Lanjut, Terbaru,
  Cari); everything else is outline or quiet text.

## Do's and Don'ts

- Do keep every badge that carries real data (type, source, chapter).
  Don't add status pills that restate the headline.
- Do use the radius tokens. Don't hard-code `rounded-full` or `10px` on
  controls; they ignore the platform scale.
- Do keep new global CSS outside Tailwind layers minimal: unlayered rules
  such as `.border-line` override utilities like `hover:border-accent`.
- Don't add hero spotlights, stats or marketing copy.
- Don't touch the mascot files or classes.
- Don't run `next build` while `next dev` is running in the same folder; it
  corrupts `.next`.
