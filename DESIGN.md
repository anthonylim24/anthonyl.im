---
name: anthonyl.im
description: Four visual worlds in one SPA; this token set is the /trips toy-world travel diorama.
colors:
  toy-sky: "#a9d8f5"
  toy-mint: "#a6e5c8"
  toy-peach: "#ffc3a6"
  toy-butter: "#ffdd7f"
  toy-lilac: "#cdc1f7"
  toy-rose: "#ffb3c4"
  toy-paper: "#fffdf6"
  toy-ink: "#1f2440"
  trips-canvas: "#edf5fb"
  trips-surface: "#fffdf6"
  trips-rail: "#f7efd9"
  trips-ink: "#1f2440"
  trips-ink-secondary: "#454b6b"
  trips-ink-tertiary: "#646a8a"
  trips-line: "#1f2440"
  trips-accent: "#1d5f91"
  trips-canvas-dark: "#151933"
  trips-surface-dark: "#1f2448"
  trips-rail-dark: "#272c56"
  trips-ink-dark: "#f6f0de"
  trips-line-dark: "#070918"
  trips-accent-dark: "#9fd3f5"
typography:
  display: "Bricolage Grotesque 750–800, font-stretch 84–92%"
  mono: "Fragment Mono — times, codes, stamps, kbd hints"
  body: "Inter (site body)"
rounded:
  radius: "0.875rem"
  field: "0.875rem"
spacing:
  target: "44px"
---

# Design System: anthonyl.im (Trips toy world)

## Overview

**Creative North Star: "A toy-world travel diorama"**

This repo hosts **four independent visual worlds** under one Vite SPA. Tokens in this file belong to **Trips** (`/trips`). Do not apply them to chatbot, BreathFlow, or the Korea Map Mode scene.

Trips is pastel papercraft and clay: every surface is a sticker with a 2px ink outline and a hard offset shadow, and the hero is a squishy clay planet you can poke. Trips become luggage tags, days become ticket stubs and postage stamps, reservations become boarding passes. Light is a sky-washed afternoon desk; dark is a navy-felt toy box with the same pastel stickers and cream ink.

**Key characteristics**
- Sticker material: ink outline (`--trips-line`) + hard offset shadow (`--trips-shadow`), spring hover tilt.
- Pastel fills (sky / mint / peach / butter / lilac / rose) are decoration; text on a fill is always `--trips-fill-ink`.
- Bricolage Grotesque display, Fragment Mono for anything a ticket machine would print.
- `data-trip-accent` sets `--ta-fill` (cover band, tag stub, stamp, active date) and `--ta` (ink accent).
- One squishy 3D moment per viewport. Everything else is flat paper.

## Three.js scenes (`frontend/src/pages/Trips/scene/`)

- **`TripsGlobe.tsx`** — lazy host. Renders a static SVG planet (`globe.still`) immediately and swaps in WebGL only when `canRender3D()` passes. No WebGL / happy-dom → SVG stays.
- **`globeScene.ts`** — clay planet built on the shared `Jelly` soft body (`frontend/src/three/`). `world` mode (index hero, create overlay) paints `worldMap.ts` continents; `region` mode (overview diorama) is a mint island with trees, clouds and gumdrop pins. `setPins` / `setFocus` ease the camera to a pin (shortest way round; jumps under reduced motion). Poke and drag go through `bindJellyPointer`; clicks on a pin call `onSelect`.
- Pins come from `useTripPins.ts`: gazetteer (`lookupPlace`) first, `getTrip` only for trips without a match (max 8, cached by `id:updatedAt`).

## Pages

- **Index** — hero grid: copy + stamp ("4 trips · 2 ahead"), `Trips` display title, search (`/` focuses, Escape clears, `n` opens create), globe whose focus follows the filtered trips. Trips are luggage tags (stub with eyelet + 3-letter code + day count) bucketed Now / Upcoming / Past. Empty state: "Where to next?" with a wobbling suitcase. Heading is never "Inbox".
- **Create** — "Pack your bag": destinations pop onto the suitcase as stickers (spring in/out). Generating shows a full-screen overlay with a planet collecting pins and rotating copy; the sr-only status in the footer stays the announcement.
- **Overview** (`/trips/:tripId`, living document) — cover band in `--ta-fill` with the region diorama (pins per day, click → day + item hash), stamp-chip date strip, sticker day cards, every editor feature intact (inline edit, enhance, ingest, settings).
- **Day** — postcard header with a date stamp + postmark, boarding-pass reservations (vertical stub label + icon), stops on a gumdrop rail with dashed route segments. Map Mode internals are untouched.
- **Concierge** — butter header sticker, dotted paper thread, dashed suggestion chips, composer shell owns the focus ring.

## Styling

- `toy.stylex.ts` — `globe`, `index`, `overview`, `pack`, `day` namespaces for the new surfaces. `trips.stylex.ts` keeps the shared editor/chat/day vocabulary; `ui.ts` re-exports class helpers.
- Disjoint media queries only (`max-width: 899.98px` / `min-width: 900px`) — StyleX does not order overlapping ones.
- `index.css` `.trips` block owns tokens, `.trips, .trips * { border-color: revert-layer }`, and the few combinator rules StyleX can't express.

## Motion

Spring (`--trips-spring`) for stickers, tags and stamps; `layoutId` sticker behind the active date; jelly physics on the planet. Reduced motion: no tilt, no wobble, planet holds still (stage dt = 0), camera jumps instead of easing.

## Do

- Keep 44px targets, visible focus rings (`--trips-focus`), `overflow-wrap: anywhere` on user strings (Hangul destinations become stickers and tag codes).
- Unmount Map Mode when closed; never React `Activity`.
- Give AI-added places structured `TripLocation`s so they can become pins.

## Don't

- Add destination routes, Korea bloom/grain/Cormorant, glassmorphism, or gradient text.
- Put body text directly on a pastel fill without `--trips-fill-ink`.
- Stack two 3D scenes in one viewport.
