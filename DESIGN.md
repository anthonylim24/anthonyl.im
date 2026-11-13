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
  ta-fill: "#f0582b"
  ta: "#b8400f"
  ta-dark: "#ff9166"
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

This repo hosts **several independent visual worlds** under one Vite SPA. Tokens in this file belong to **Trips** (`/trips`) only. Do not apply them to the landing page, chatbot, BreathFlow, or the Korea Map Mode scene.

Trips is a map-first planner. Cool chart-paper surfaces, hairline rules, soft layered shadows, serif names set like map labels, coordinates and data in mono, and one live 3D map per page. A trip's accent is the only colour; everything else is ink and paper.

**Key characteristics**
- One live map per viewport (MapLibre GL JS v6, OpenFreeMap vector tiles, no API key).
- Paper surfaces: `--trips-canvas` / `--trips-surface` / `--trips-raised` / `--trips-sunken`, 1px `--trips-line` rules, `--trips-shadow-1/2/3`.
- Instrument Serif display with an italic emphasised word ("Where to *next?*"), Fragment Mono eyebrows and data, Inter body.
- Primary buttons are ink, not accent. The accent goes to pins, the route, cover art, chips and focus rings.
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

App default (no trip in scope) is signal orange: `--ta-fill #f0582b`, text `--ta #b8400f` light / `#ff9166` dark. A trip sets `data-trip-accent` on its subtree:

| Key | Name | `--ta-fill` | Note |
|-----|------|-------------|------|
| `rose` | Poppy | `#e5484d` | |
| `amber` | Saffron | `#f2a71b` | Dark ink on the fill (`--ta-on`) |
| `emerald` | Jade | `#0f9b76` | |
| `sky` | Cobalt | `#2f7bf0` | |
| `violet` | Iris | `#7c5cff` | |

Vars: `--ta` (text-safe, 4.5:1 on canvas and surface), `--ta-fill` (pins, route, cover art), `--ta-on` (ink on the fill), `--ta-soft` (tint), `--ta-ring` (focus). Labels and helpers live in `meta.ts` (`TRIP_ACCENTS`, `ACCENT_LABEL`, `resolveAccent`).

## Map (`frontend/src/pages/Trips/map/`)

- **`AtlasMap.tsx`**: React host. Lazy-loads `engine.ts`, so the `maplibre` chunk loads with the first map, not with the route.
- **`engine.ts`**: `createAtlasMap`. Owns the MapLibre instance, pins, route line and camera (fly-to, fit bounds, ambient spin on the index globe).
- **`mapStyle.ts`**: custom two-palette basemap (light and dark) over OpenFreeMap OpenMapTiles. Globe projection with atmosphere at low zoom; extruded 3D buildings from zoom 14.5.
- **`geo.ts`**: pure helpers (`dayPins`, `tripPins`, `dayRoute`, `centroid`, `formatCoord`, `projectToBox`).
- **`map.stylex.ts`**: map frame, place card, phone map toggle.
- Pins are DOM buttons styled by `.atlas-pin*` in `index.css`: numbered stop pins on a day, day-numbered dots on the overview, trip chips on the index globe. The route is a dotted accent line.
- Hovering a list item lifts its pin. Clicking a numbered marker flies the camera to it and opens a place card with Directions.
- Photoreal Google 3D Tiles (`pages/Korea/MapModeOverlay`) is a separate full-screen mode, opened from a day's "…" menu as "Explore in photoreal 3D" when `VITE_GOOGLE_MAP_TILES_API_KEY` or `VITE_GOOGLE_PLACES_API_KEY` is set. It must unmount when closed.

## Pages

- **Index** (`/trips`): hero ("Where to *next?*") beside an ambient spinning globe with one pin per trip. Trips are cards bucketed Happening now / Upcoming / Past. `/` focuses search, `n` opens create. Heading is never "Inbox".
- **Covers**: each card's cover is a chart of the trip's own stops (`components/TripCover.tsx`, from the summary's `points`). No stock imagery.
- **Create** (`/trips/new`): destinations with city autocomplete (`components/CityField.tsx`), dates with length presets, optional name, and a "Draft the itinerary with AI" switch with a pace / interest brief. The map flies to each destination as it is added.
- **Workspace** (`/trips/:tripId`, `/trips/:tripId/day/:dayId`): `TripWorkspace` is an itinerary pane plus a sticky map. `:tripId` is the overview tab; `/day/:dayId` is that day. Arrow keys change day. On phones a floating Map / Itinerary toggle swaps the pane for a full-screen map.
- **Join** (`/trips/join/:token`): accept an invite link.
- **Concierge**: chat FAB on the workspace (`TripChat`, `chat.stylex.ts`).

## Styling

- `atlas.stylex.ts`: primitives `a` (type, buttons, fields, chips, pills, menu, dialog). Compose these before writing new styles: `{...sx(a.btn, a.btnPrimary)}`.
- `index.stylex.ts`: `shell`, `idx`, `cover`, `create`. `workspace.stylex.ts`: `share`, `ws`. `map/map.stylex.ts`, `chat.stylex.ts`.
- `components/kit.tsx`: `Menu`, and `Modal` (Radix dialog that becomes a bottom sheet on phones). `Modal` re-declares the `.trips` token scope on its portal via `.trips.trips-portal`, so portaled content still resolves `--trips-*` / `--ta-*`.
- `meta.ts`: pure date / accent / icon helpers. `useTripEditor.ts`: document state, autosave and AI runs.
- `index.css` `.trips` block owns tokens, accents, `.atlas-pin*`, MapLibre chrome overrides and the few rules StyleX can't express.

## Motion

Spring (`--trips-spring`) on pins and buttons, fly-to camera moves, a drop-in for newly added pins (`.atlas-pin--fresh`), staggered card rise. All gated on `prefers-reduced-motion`: the map uses `jumpTo` and the index globe does not spin.

## Do

- Keep 44px targets.
- Draw a focus ring on every new control with `--ta-ring`. Trips disables the global outline (`.trips :focus-visible { outline: none }`), so nothing is focus-visible by default.
- Use the `trips-title-input` / `trips-day-title-input` classes on editable titles to opt out of the 16px phone input pin.
- Keep `overflow-wrap: anywhere` on user strings (`a.wrap`).
- Give AI-added places structured `TripLocation`s so they can become pins.
- Keep the map engine a lazy chunk (`maplibre` ≈ 1.07 MB / 290 kB gzip).

## Don't

- Bring back the previous toy / sticker look: ink outlines with hard offset shadows, pastel fills.
- Stack glassmorphism, use gradient text, stock travel photography, or generic SaaS dashboard chrome.
- Put two maps in one viewport.
- Add destination-specific routes, or restyle Trips into the Korea dossier.
- Hide photoreal Map Mode with React `Activity`. Unmount it.
