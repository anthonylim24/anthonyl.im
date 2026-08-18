---
name: anthonyl.im
description: Four visual worlds in one SPA; this token set is the /trips JR pocket timetable.
colors:
  trips-canvas: "oklch(94.8% 0.018 128)"
  trips-surface: "oklch(97.4% 0.01 128)"
  trips-rail: "oklch(92.2% 0.022 128)"
  trips-ink: "oklch(22% 0.028 140)"
  trips-ink-secondary: "oklch(38% 0.024 140)"
  trips-ink-tertiary: "oklch(48% 0.02 140)"
  trips-border: "oklch(22% 0.028 140 / 0.14)"
  trips-band: "oklch(31% 0.058 148)"
  trips-band-ink: "oklch(96.2% 0.018 128)"
  trips-accent: "oklch(36% 0.07 148)"
  trips-accent-hover: "oklch(28% 0.064 148)"
  trips-focus: "oklch(36% 0.07 148 / 0.45)"
  trips-scrim: "oklch(22% 0.028 140 / 0.52)"
  trips-canvas-dark: "oklch(16.4% 0.024 148)"
  trips-surface-dark: "oklch(20.2% 0.022 148)"
  trips-rail-dark: "oklch(18.4% 0.024 148)"
  trips-ink-dark: "oklch(93.4% 0.02 128)"
  trips-ink-secondary-dark: "oklch(78% 0.022 128)"
  trips-ink-tertiary-dark: "oklch(66% 0.018 128)"
  trips-border-dark: "oklch(93.4% 0.02 128 / 0.14)"
  trips-band-dark: "oklch(26% 0.05 148)"
  trips-band-ink-dark: "oklch(94.8% 0.02 128)"
  trips-accent-dark: "oklch(78% 0.06 148)"
  trips-accent-hover-dark: "oklch(86% 0.05 148)"
  trips-focus-dark: "oklch(78% 0.06 148 / 0.5)"
  trips-accent-rose: "oklch(48% 0.17 16.4)"
  trips-band-rose: "oklch(36% 0.14 16.4)"
  trips-canvas-rose: "oklch(95% 0.022 16.4)"
  trips-accent-amber: "oklch(46% 0.1 70.1)"
  trips-band-amber: "oklch(38% 0.1 70.1)"
  trips-canvas-amber: "oklch(95% 0.022 70.1)"
  trips-accent-emerald: "oklch(42% 0.09 162.5)"
  trips-band-emerald: "oklch(34% 0.08 162.5)"
  trips-canvas-emerald: "oklch(95% 0.022 162.5)"
  trips-accent-sky: "oklch(44% 0.09 237.3)"
  trips-band-sky: "oklch(36% 0.08 237.3)"
  trips-canvas-sky: "oklch(95% 0.02 237.3)"
  trips-accent-violet: "oklch(46% 0.14 292.7)"
  trips-band-violet: "oklch(36% 0.12 292.7)"
  trips-canvas-violet: "oklch(95% 0.022 292.7)"
typography:
  display:
    fontFamily: "Archivo Narrow, Arial Narrow, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Archivo Narrow, Arial Narrow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo Narrow, Arial Narrow, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  trips: "0.25rem"
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
spacing:
  gutter: "16px"
  gutter-lg: "24px"
  cover: "40px"
  document: "64px"
  target: "44px"
components:
  cover-band:
    backgroundColor: "{colors.trips-band}"
    textColor: "{colors.trips-band-ink}"
    typography: "{typography.display}"
    rounded: "0"
    padding: "40px 24px"
  button-primary:
    backgroundColor: "{colors.trips-accent}"
    textColor: "{colors.trips-band-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.trips-accent-hover}"
    textColor: "{colors.trips-band-ink}"
    rounded: "{rounded.lg}"
    height: "44px"
  button-band:
    backgroundColor: "{colors.trips-band-ink}"
    textColor: "{colors.trips-band}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
    height: "44px"
  next-time:
    backgroundColor: "transparent"
    textColor: "{colors.trips-band-ink}"
    typography: "{typography.display}"
    rounded: "0"
  status-chip:
    backgroundColor: "{colors.trips-surface}"
    textColor: "{colors.trips-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
    height: "22px"
  snap-rail:
    backgroundColor: "transparent"
    textColor: "{colors.trips-ink}"
    typography: "{typography.label}"
    rounded: "0"
    height: "56px"
---

# Design System: anthonyl.im (Trips timetable)

## Overview

**Creative North Star: "The JR Pocket Timetable"**

This repo hosts **four independent visual worlds** under one Vite SPA. Tokens in this file belong to **Trips** (`/trips`). Do not apply them to the other three worlds, and do not restyle chatbot or BreathFlow as a timetable.

1. **Chatbot** (`/`, `/chatbot`): quiet parchment, grain, amber send, Inter + Cormorant. Stay quiet.
2. **BreathFlow** (`/breathwork`): wellness instrument: parchment chrome, Geist + Fragment Mono, sacred glass orb. Chrome stays matte.
3. **Korea seed** (`/trips/korea-2026`; `/korea` redirects): cinematic parchment dossier with rose/amber bloom and Cormorant. Map Mode photorealism lives here and is reused by Trips.
4. **Trips timetable** (`/trips`): this file. Green-gray print stock, deep JR-green cover band, Archivo Narrow times. Not Korea. Not Linear/Notion zinc.

The trip is a pocket timetable. Days are stations; bookings are trains. Light is kitchen-table afternoon planning on tinted print paper. Dark is a hotel-lamp evening lookup on the same stock, dimmed, never a zinc IDE. The first viewport commits a cover band (30–40%) with a condensed title and the next time, then a station-tick snap rail, then schedule rows. Shared-site Cormorant, Korea bloom/grain, and Linear/Notion workspace chrome are anti-references for this route only.

**Key Characteristics:**
- Four worlds; Trips tokens never leak into chatbot or BreathFlow
- Cover band first; next time huge in Archivo Narrow 600 / `-0.02em`
- Green-gray print stock + JR-green band; dark is lamp-lit tint, not zinc
- Station ticks on a hairline snap rail; timetable rows, not cards
- Status is a geometric mark plus a label
- `data-trip-accent` retints canvas + band (rose / amber / emerald / sky / violet)

## Colors

Print-stock green-gray with one deep JR-green cover. Accent is the same green by default; a trip may retint canvas and band, never the other three apps.

### Primary
- **JR Cover Green** (`{colors.trips-band}`): the committed cover band. Occupies 30–40% of the first viewport. Type on it uses **Band Ink** (`{colors.trips-band-ink}`).
- **JR Accent Green** (`{colors.trips-accent}`): interactive ink, focus, the default `data-trip-accent` before a trip picks a hue. Hover is `{colors.trips-accent-hover}`.

### Neutral
- **Print Stock** (`{colors.trips-canvas}`): page canvas. Green-gray paper, not parchment `#F5F2ED` and not zinc.
- **Sheet** (`{colors.trips-surface}`): fields and panels sitting on the stock.
- **Hairline Ink** (`{colors.trips-ink}`): body; secondary `{colors.trips-ink-secondary}`; tertiary `{colors.trips-ink-tertiary}`; rules `{colors.trips-border}`.
- **Lamp Stock** (`{colors.trips-canvas-dark}`): dark canvas. Band becomes `{colors.trips-band-dark}`. Keep chroma; do not desaturate into a cool gray IDE.

### Named Rules
**The Four Worlds Rule.** These oklch values style `.trips` only. Chatbot grain, BreathFlow orb chrome, and Korea parchment/bloom keep the palettes in `PRODUCT.md`. Never “unify” the SPA onto print stock.

**The Print Stock Rule.** Light is kitchen-table paper (`{colors.trips-canvas}`). Dark is lamp-lit tinted stock (`{colors.trips-canvas-dark}`), not Linear zinc and not Korea nightscape purple.

**The Accent Retint Rule.** `data-trip-accent` on a trip subtree retints **canvas + cover band** together (rose / amber / emerald / sky / violet). It is a timetable reprint, not bloom wallpaper. `--ta-bloom-a` / `--ta-bloom-b` stay unused.

## Typography

**Display Font:** Archivo Narrow (fallback Arial Narrow, sans-serif)
**Body Font:** Inter (system-ui, sans-serif)
**Label/Mono Font:** Archivo Narrow with tabular lining numerals for times (`font-variant-numeric: tabular-nums`)

**Character:** Condensed station-board times against a quiet Inter UI. Weight 600 and tracking `-0.02em` make the clock the loudest type on the page. Inter never plays display.

### Hierarchy
- **Hero time** (`typeHeroTimeClass`, 2.5–3.25rem tabular): next departure and the day’s first booking. The one large type moment.
- **Display** (`typeDisplayClass`, 1.75–2.25rem): cover trip name. Always a step below the hero clock.
- **Page title** (`typePageTitleClass`, 1.75–2rem): index “Trips”, day title, empty state.
- **Section** (`typeSectionClass`, 1.25rem): living-document headings and dialog titles.
- **Body** (`typeBodyClass`, 0.9375rem / 1.5): UI copy, notes, destinations. Max ~58–60ch on the cover legend.
- **Meta** (`typeMetaClass`, 0.8125rem): status line, snap-rail weekdays, crumbs.
- **Label** (`typeLabelClass`, 0.75rem): field labels and hints. Status chips use `typeStampClass` (uppercase) only.

### Named Rules
**The Condensed Time Rule.** Times and trip titles are Archivo Narrow 600 / `-0.02em`. Inter is UI body only. Inter-as-display is a defect.

**The No Cormorant Rule.** `/trips` never loads display serif. Banned on this route: Fraunces, Playfair, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, Inter-as-display, DM Sans, DM Serif, Outfit, Plus Jakarta, Instrument Sans. Cormorant remains correct on chatbot and Korea; Fragment Mono remains correct on BreathFlow.

## Layout

A single printed sheet, not a workspace. Slim sticky chrome (`--trips-chrome-h`, 3.5rem / 3rem from `sm`) with a “Trips” wordmark and **no left rail**. On scroll past 24px the chrome compactifies to 2.75rem and the cover band sticks under it, shrinking title/time and hiding `.cover-extra` so the itinerary owns the viewport. The living document is `max-w-5xl` with `16px` gutters (`24px` from `sm`). Cover band is full-bleed, then the sheet. First viewport: band (30–40%) with condensed title + next time; station-tick snap rail; schedule rows. Index is end-label timetable rows in Now / Upcoming / Past. Heading is “Trips” or “No trips yet”, never “Inbox”. Day pages stay; `/trips/:id/edit` redirects to the living document. Concierge FAB on trip + day only. Interactive targets are 44px (`{spacing.target}`). User-authored strings use `break-words` + `overflow-wrap: anywhere`.

### Named Rules
**The Cover Band Rule.** The first viewport starts with a committed band, not a property table, not a listing hero, not Korea orb cards.

**The Station Tick Rule.** Multi-day trips get a snap rail of vertical ticks on a 1px hairline. A one-day trip grows no rail.

## Elevation & Depth

Flat print. Depth is tonal (stock vs sheet vs band) and hairline rules, not drop shadows. Popovers may use a single structural shadow; page chrome does not float. Motion is short spring reveals (`cubic-bezier(0.16, 1, 0.3, 1)`, ~220ms) and honors `prefers-reduced-motion`. Map Mode is a real 3D scene, not a card elevation, and it **unmounts** when closed.

### Named Rules
**The Hairline Rule.** Rows, legends, and rails divide with 1px ink at `{colors.trips-border}`. No stacked glass, no grain, no drifting bloom.

## Shapes

Tight print geometry. `.trips` sets `--trips-radius` / `--radius: 0.25rem` (`{rounded.trips}`). Inputs, chips, badges, buttons, dialogs, and chat chrome all use that token. Cover band is square (radius 0). Station ticks are 1×10px lines; the active day is a small rotated rectangle, not a pill. Status is a 6px geometric mark (dot or square) beside a label; hue alone is not status. Do not drift toward stadium pills, mixed `rounded-xl` / `rounded-2xl`, or identical card grids.

## Components

Timetable parts, not SaaS primitives. Compose from `frontend/src/pages/Trips/ui.ts`.

### Buttons
- **Shape:** 44px min height; `{rounded.trips}` on every control.
- **Primary:** `{colors.trips-accent}` fill, `{colors.trips-band-ink}` label. Hover `{colors.trips-accent-hover}`.
- **Band:** inverted on the cover: `{colors.trips-band-ink}` fill, `{colors.trips-band}` label (Map Mode on the cover).
- **Hover / Focus:** hairline or fill shift; focus ring `{colors.trips-focus}`, 2px, offset on filled buttons.

### Chips
- **Style:** geometric mark + uppercase-small label is for **status only**. Tags on the cover are hairline boxes, not pills.
- **State:** booked / active get an emerald mark; draft / optional / done get a stone mark. Never color-only.

### Cards / Containers
- **Corner Style:** `{rounded.trips}` if a surface is required; prefer hairline rows.
- **Background:** `{colors.trips-canvas}` page, `{colors.trips-rail}` inset wells, `{colors.trips-surface}` opaque panels and dialogs. Never a translucent stone fill.
- **Shadow Strategy:** none on the document.
- **Border:** `{colors.trips-border}` hairlines.
- **Internal Padding:** cover `{spacing.cover}`; document bottom `{spacing.document}`.

### Inputs / Fields
- **Style:** recessed rail well, hairline `{colors.trips-border}`, inset shadow, 44px target. Display title on the band is borderless Archivo Narrow.

### Enhance dialog
Chevron disclosure opens a modal (centered on desktop, sheet on phones). Always an opaque `{colors.trips-surface}` panel on `{colors.trips-scrim}` + light blur. Title **Focus this review**. Actions: Cancel and **Run enhance**. The split button’s primary side still runs a full pass immediately.
- **Focus:** accent border + `{colors.trips-focus}` ring.
- **Error / Disabled:** destructive red fill for errors; 50% opacity when disabled. Viewers get static text, not disabled inputs.

### Navigation
Slim top chrome, breadcrumb “Trips / {slug}”. Index heading “Trips”. Snap rail is the day nav. No Linear workspace rail. Concierge FAB only on `/trips/:id` and `/trips/:id/day/:dayId`.

### Cover band
Full-bleed `{colors.trips-band}`. Status line, condensed title, destinations · dates, next time in Display, then Map Mode. Occupies 30–40% of the first viewport.

### Next time
The next booking’s clock is Hero time. Title sits beside it one step smaller. On the day page the first reservation is this same hero: huge condensed time, not a table cell. Compact cover shrinks the clock to 1.5rem.

### Snap rail
Horizontal station ticks on a 1px center hairline (`.snap-rail`). Weekday + day number in Archivo Narrow. Active tick uses trip accent.

### Status mark
`StatusChip` / `TripStatusChip`: 6px mark + label. Do not replace with hue-only pills or emoji traffic lights.

### Schedule row
End-label timetable row: name, destinations, range, count; time or countdown at the trailing edge. Now / Upcoming / Past. Not Airbnb listing cards.

## Do's and Don'ts

### Do:
- **Do** start the living document with a committed cover band (30–40% of the first viewport) and a huge next time in Archivo Narrow. Compact the chrome and cover on scroll.
- **Do** put fields in recessed `--trips-rail` wells and dialogs on opaque `--trips-surface` with a scrim.
- **Do** use station ticks on a hairline snap rail for multi-day trips.
- **Do** set times and titles in Archivo Narrow 600 / `-0.02em`; body in Inter.
- **Do** keep the document `max-w-5xl`, radius `0.25rem`, and 44px targets.
- **Do** retint canvas + cover band with `data-trip-accent` (rose / amber / emerald / sky / violet).
- **Do** show status as a geometric mark + label.
- **Do** unmount Map Mode when closed (never React `Activity`).
- **Do** write frontend `/api` I/O in Effect v3 (`tripsApi.ts`, `tripChatApi.ts`).
- **Do** wrap user-authored strings with `break-words` + `overflow-wrap: anywhere`.
- **Do** write copy with “to” or middots; no em dash.

### Don't:
- **Don't** restyle `/trips` as Linear or Notion zinc (cool gray IDE, left workspace rail, Inbox).
- **Don't** label the index “Inbox”. Heading is “Trips” or “No trips yet”.
- **Don't** add a left workspace rail, a Notion property-table hero, or Airbnb listing cards.
- **Don't** restyle `/trips` as Korea parchment, grain, rose/amber bloom, or Cormorant.
- **Don't** use Inter as display, or any banned display face listed under Typography.
- **Don't** add kickers, gradient text, or decorative glass on Trips chrome.
- **Don't** lay out identical card grids as the index or day body.
- **Don't** add `/japan`-style destination routes; new destinations are trip documents.
- **Don't** hide Map Mode / WebGL with React `Activity`.
- **Don't** restyle chatbot or BreathFlow as a pocket timetable.
