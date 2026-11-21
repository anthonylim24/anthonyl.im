---
name: anthonyl.im
description: Several visual worlds in one SPA; this token set is the /trips atlas (map-first trip planner).
colors:
  trips-canvas: "#f1f0eb"
  trips-surface: "#faf9f6"
  trips-raised: "#ffffff"
  trips-sunken: "#e8e7e1"
  trips-ink: "#14171a"
  trips-ink-secondary: "#4d5259"
  trips-ink-tertiary: "#696e75"
  trips-line: "rgb(20 23 26 / 0.1)"
  trips-canvas-dark: "#0b0d10"
  trips-surface-dark: "#13161a"
  trips-raised-dark: "#1a1e23"
  trips-sunken-dark: "#07090b"
  trips-ink-dark: "#eceae4"
  trips-ink-secondary-dark: "#b0b4ba"
  trips-ink-tertiary-dark: "#8b9097"
  trips-line-dark: "rgb(255 255 255 / 0.1)"
  brand-fill: "#f0582b"
  brand: "#b8400f"
  brand-dark: "#ff9166"
  accent-rose-poppy: "#e5484d"
  accent-amber-saffron: "#f2a71b"
  accent-emerald-jade: "#0f9b76"
  accent-sky-cobalt: "#2f7bf0"
  accent-violet-iris: "#7c5cff"
typography:
  display: "Instrument Serif (--trips-display); italic for the emphasised word"
  mono: "Fragment Mono (--trips-mono): eyebrows, coordinates, data"
  body: "Inter"
rounded:
  radius: "0.875rem"
  radius-sm: "0.625rem"
  radius-lg: "1.375rem"
  field: "0.75rem"
spacing:
  target: "44px"
motion:
  spring: "cubic-bezier(0.34, 1.4, 0.64, 1)"
  ease-out: "cubic-bezier(0.16, 1, 0.3, 1)"
---

# Design System: anthonyl.im (Trips, "the atlas")

## Overview

**Creative North Star: "A cartographer's desk"**

This repo hosts **several independent visual worlds** under one Vite SPA. Tokens in this file belong to **Trips** (`/trips`) only. Do not apply them to the landing page, chatbot, or BreathFlow.

Trips is a map-first planner. Cool chart-paper surfaces, hairline rules, soft layered shadows, serif names set like map labels, coordinates and data in mono, and one live 3D map per page. Two accents: a constant brand accent (signal orange, `--brand*`) for chrome, and the trip's own accent (`--ta*`) for trip identity; everything else is ink and paper.

**Key characteristics**
- One live map per viewport (MapLibre GL JS v6, OpenFreeMap vector tiles, no API key).
- Paper surfaces: `--trips-canvas` / `--trips-surface` / `--trips-raised` / `--trips-sunken`, 1px `--trips-line` rules, `--trips-shadow-1/2/3`.
- Instrument Serif display with an italic emphasised word ("Where to *next?*"), Fragment Mono eyebrows and data, Inter body.
- Primary buttons are ink. The brand accent paints chrome (focus rings, AI actions, switches, links, the compass mark); the trip accent paints trip identity (pins, route, date tiles, the status eyebrow, the pinned-location row, covers).
- No stickers, no hard offset shadows, no pastel fills.

## Tokens (`frontend/src/index.css`, `.trips` block: "TRIPS — the atlas")

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--trips-canvas` | `#f1f0eb` | `#0b0d10` | Page |
| `--trips-surface` | `#faf9f6` | `#13161a` | Panes, cards |
| `--trips-raised` | `#ffffff` | `#1a1e23` | Menus, dialogs, fields |
| `--trips-sunken` | `#e8e7e1` | `#07090b` | Wells, rails |
| `--trips-ink` | `#14171a` | `#eceae4` | Text, primary buttons |
| `--trips-ink-secondary` | `#4d5259` | `#b0b4ba` | Body copy |
| `--trips-ink-tertiary` | `#696e75` | `#8b9097` | Hints, eyebrows |
| `--trips-line` | `rgb(20 23 26 / .1)` | `rgb(255 255 255 / .1)` | Hairline rules |
| `--trips-shadow-1/2/3` | soft layered | deeper + 1px light edge | Card / popover / dialog |
| `--trips-radius` | `0.875rem` (`-sm` `0.625rem`, `-lg` `1.375rem`) | same | Rounding |
| `--trips-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | same | Pins, buttons |
| `--trips-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | same | Reveals, sheets |

### Accent

Two accents, never mixed.

**Brand** (constant signal orange, never changes with the trip): `--brand` (text; `#b8400f` light / `#ff9166` dark), `--brand-fill` (`#f0582b`), `--brand-soft`, `--brand-ring` (solid `--brand`, so a 2px ring on its 2px canvas gap clears 3:1 in both themes). Used for chrome: focus rings, AI actions, switches, links, the compass mark.

**Trip** (`--ta*`, defaults to the brand): reserved for trip identity: pins, route, date tiles, the status eyebrow, the pinned-location row, covers. A trip sets `data-trip-accent` on its subtree:

| Key | Name | `--ta-fill` | Note |
|-----|------|-------------|------|
| `rose` | Poppy | `#e5484d` | |
| `amber` | Saffron | `#f2a71b` | Dark ink on the fill (`--ta-on`) |
| `emerald` | Jade | `#0f9b76` | |
| `sky` | Cobalt | `#2f7bf0` | |
| `violet` | Iris | `#7c5cff` | |

Vars: `--ta` (text-safe, 4.5:1 on canvas and surface), `--ta-fill` (pins, route, cover art), `--ta-on` (ink on the fill), `--ta-soft` (tint), `--ta-ring`. Labels and helpers live in `meta.ts` (`TRIP_ACCENTS`, `ACCENT_LABEL`, `resolveAccent`).

## Map (`frontend/src/pages/Trips/map/`)

- **`AtlasMap.tsx`**: React host. Lazy-loads `engine.ts`, so the `maplibre` chunk loads with the first map, not with the route.
- **`engine.ts`**: `createAtlasMap`. Owns the MapLibre instance, pins, route line and camera (fly-to, fit bounds, tilted arrival frames at pitch 52 for city-scale spans, ambient spin on the index globe). `renderStills` renders index card covers from one off-screen map.
- **`mapStyle.ts`**: custom two-palette basemap (light and dark) over OpenFreeMap OpenMapTiles. Globe projection with atmosphere at low zoom; extruded 3D buildings from zoom ~13.2.
- **`geo.ts`**: pure helpers (`dayPins`, `tripPins`, `tripDots`, `dayRoute`, `centroid`, `formatCoord`, `projectToBox`).
- **`map.stylex.ts`**: map frame, place card, phone map toggle.
- Pins are DOM buttons styled by `.atlas-pin*` in `index.css`.
- Overview map: one numbered pin per day at that day's centroid (click opens the day) over small dots for every stop. No routes.
- Day map: numbered stop pins plus the route. One shallow arc per leg (deduplicated), a solid 3px trip-accent line on a paper casing, small direction chevrons.
- Index globe: trip chips that flip side past the globe's midline. No basemap labels, a CSS limb shade, and at rest it faces the next trip.
- Hovering a list item lifts its pin. Clicking a stop pin flies the camera to it and opens a place card: "Stop N of M", Directions, Edit stop, and previous / next stepping that flies the camera.
- The photoreal 3D view (`pages/Trips/photoreal/`, "Fly the day") is a separate full-screen mode on Google 3D Tiles, opened from a day's "…" menu as "Fly the day in 3D" when `photorealAvailable()` is true (a Google tiles / Places key and WebGL2; always in dev). It must unmount when closed.

## Pages

- **Index** (`/trips`): hero ("Where to *next?*") beside the ambient globe with one chip per trip. With three or fewer trips the cards sit in one row with no headings; from four they are bucketed Happening now / Upcoming / Past. Cards carry a mono countdown chip; a lifetime-figures strip (mono numerals, hairline separators) sits beside "Your trips". `/` focuses search, `n` opens create. Heading is never "Inbox".
- **Covers**: real map stills of the trip's stops, rendered by one off-screen MapLibre map (`renderStills`). The SVG chart (`components/TripCover.tsx`, from the summary's `points`) is the loading / no-WebGL fallback. No stock imagery.
- **Create** (`/trips/new`): destinations with city autocomplete (`components/CityField.tsx`), a custom date-range calendar (`components/DateRange.tsx`, also used in Trip details) with length presets (Weekend, 5 days, 1 week, 2 weeks), optional name, a "Draft the itinerary with AI" switch with a pace / interest brief, and a sticky submit row. No step circles. The map flies to each destination; on phones it is a small non-interactive strip under the title.
- **Workspace** (`/trips/:tripId`, `/trips/:tripId/day/:dayId`): `TripWorkspace` is an itinerary pane plus a sticky map. The full header shows on the overview only; day pages use a compact one-row header (trip name links to the overview, Share, ⋯ with "Improve whole trip with AI"). Left / right arrow keys change day. Phones get a docked bottom bar with an Itinerary | Map switch (`radiogroup`) and the concierge button inside it.
- **Overview tabs** (`workspace/OverviewTabs.tsx`): text tabs with an ink underline under the day rail, `?tab=`. Panels: Itinerary (now card first: paper card, hairline frame, the trip-accent date tile as its one accent, mono clock and countdown, serif stop name), Budget (`budget/`: serif total, one hairline meter with spent solid and planned hatched, category bars, expense rows with mono amounts), Checklist and Essentials (`prep/`: serif group headings, 44 px check rows drawn in brand when ticked, label / value rows for facts).
- **Day layouts**: List | Timeline segmented switch (`share.segment`). Timeline (`timeline/`): mono hour labels on a ruler of 1 px hour hairlines, blocks by minute with pin badges and category icons, travel connectors with a mode icon, mono "1 h 20 free", conflict badges; "Now" is a trip-accent hairline with a dot on the stop gutter in both layouts. Day sky (`workspace/DaySky.tsx`): the sky's engraving (6rem; on phones 4rem, in one band with the temperatures and the light) inked in `--trips-ink-secondary`, its print on dark paper, a mono "Forecast" / "Expected" eyebrow, the high in Instrument Serif with the low smaller in tertiary, the sky word with "60% chance", and mono sunrise / sunset; never tinted with either accent. The plan's expected weather is an estimate: "≈" before the high, which drops to secondary ink. A day in the forecast's reach with no forecast says "Not available right now" under a faint engraving. The overview's day rows keep a Lucide glyph and the high (engravings do not read below about 3rem). Timeline weather: mono hour temperatures under the hour labels; likely rain as a dashed strip in the gutter between the hours and the stops (never over a stop), a "Showers likely 2–5 PM · 60%" part in the summary and a rain line on each stop it meets; dashed hairlines at sunrise and sunset with the dark hours a 4% wash of ink. The ruler runs from the first stop's hour to the last stop's end (three hours at least); on today the free time counts from now. One card face: every title in the UI sans, stacked lanes show a bare "10:15–11:30" and keep two title lines.
- **Command palette** (`command/`): Radix dialog, combobox over a grouped listbox with mono group eyebrows, icon / title / muted subtitle / right-aligned `kbd` per row, the active row marked by a brand-ring edge, a mono hint footer hidden on phones. The shortcuts sheet is a kit `Modal`.
- **Print** (`print/`): portalled print root, hidden on screen; Instrument Serif headings, Fragment Mono times, hairline rules, pin numbers as small filled circles in the trip accent with contrast-chosen ink; no backgrounds or gradients.
- **Stop cards**: time column on the left (above the title on phones). The grip shows on hover / focus and is hidden on phones; Alt+↑ / ↓ reorders with a live announcement. The day menu offers "Sort stops by time" when times are out of order. Times use a typed `TimeField` (`parseClock`) with "Add end time". A card that overlaps an earlier stop says "Overlaps X" (or "Tight") in ink, and one that meets likely rain says "Showers likely · 60% chance" in secondary ink (`workspace/stopAlerts.ts`, from the same layout the timeline draws). Status chips (Booked, Optional, Needs review) are mono outline chips, never green.
- **Day rail** (`workspace/DayRail.tsx`): the selected day is centred in the rail (the scroller moves, never the page), and the rail fades only at an edge that can scroll.
- **Join** (`/trips/join/:token`): accept an invite link.
- **Concierge**: chat button on the workspace (`TripChat`, `chat.stylex.ts`), inside the bottom bar on phones. Message column with a live status line (brand accent), compact place cards (photo or category tile, rating, hours, walk from the plan, dated "Add to …" primary), one proposal card per batch of changes (mono times, per-row ticks, Apply, then Undo), source chips and follow-up chips as outline pills. The stream caret and every AI affordance use the brand accent, never the trip accent.
- **Instagram import**: a two-pane sheet (`instagram/InstagramSheet.tsx`): paste field, Posts / Saved tabs and place rows on the left, a top-down map of the places on the right (a strip on phones). Paper-grid placeholder until a post has places. Place tiles and pins use the trip accent; progress and actions use the brand accent. Imported places without a time sit under a mono "To schedule" header on the day and show as unnumbered dots on the map.
- **Photoreal 3D ("Fly the day")**: full-screen over Google 3D Tiles. Paper veil with a mono progress chip while tiles settle; numbered pins with stem and ground ring; hollow pins for "To schedule" places; thin route arcs with distant legs faded; pinned stop card (photo, mono eyebrow, serif name) above a compact stop list on desktop, chip rail plus bottom card on phones. "From Instagram · Open the post" on imported places.
- **Icons**: sparkle = AI generation, lightbulb = "Ideas for this day", chat glyph = concierge.

## Styling

- `atlas.stylex.ts`: primitives `a` (type, buttons, fields, chips, pills, menu, dialog). Compose these before writing new styles: `{...sx(a.btn, a.btnPrimary)}`.
- `index.stylex.ts`: `shell`, `idx`, `cover`, `create`. `workspace.stylex.ts`: `share`, `ws`. `map/map.stylex.ts`, `chat.stylex.ts`.
- `components/kit.tsx`: `Menu`, and `Modal` (Radix dialog that becomes a bottom sheet on phones). `Modal` re-declares the `.trips` token scope on its portal via `.trips.trips-portal`, so portaled content still resolves `--trips-*` / `--brand-*` / `--ta-*`.
- `meta.ts`: pure date / accent / icon helpers. `useTripEditor.ts`: document state, autosave and AI runs.
- `index.css` `.trips` block owns tokens, accents, `.atlas-pin*`, MapLibre chrome overrides and the few rules StyleX can't express.

## Motion

Spring (`--trips-spring`) on pins and buttons, fly-to camera moves, a drop-in for newly added pins (`.atlas-pin--fresh`), staggered card rise. All gated on `prefers-reduced-motion`: the map uses `jumpTo` and the index globe does not spin.

## Do

- Keep 44px targets.
- Draw a focus ring on every new control with `--brand-ring` (`a.focusable`). Trips disables the global outline (`.trips :focus-visible { outline: none }`), so nothing is focus-visible by default.
- Use the `trips-title-input` / `trips-day-title-input` classes on editable titles to opt out of the 16px phone input pin.
- Keep `overflow-wrap: anywhere` on user strings (`a.wrap`).
- Give AI-added places structured `TripLocation`s so they can become pins.
- Keep the map engine a lazy chunk (`maplibre` ≈ 1.07 MB / 290 kB gzip).

## Don't

- Bring back the previous toy / sticker look: ink outlines with hard offset shadows, pastel fills.
- Stack glassmorphism, use gradient text, stock travel photography, or generic SaaS dashboard chrome.
- Put two maps in one viewport.
- Tint chrome (focus rings, AI actions, switches, links) with the trip accent, or trip identity with the brand.
- Add destination-specific routes, or restyle Trips into the Korea dossier.
- Hide the photoreal 3D view with React `Activity`. Unmount it.
