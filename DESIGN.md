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
| `--trips-selected-edge` | `transparent` | `#5d6269` | Edge of a selected segment (3.2:1 on dark `--trips-sunken`) |
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
- Hovering a list item lifts its pin. Clicking a stop pin flies the camera to it and opens a place card: the stop's photo bled to its edges, "Stop N of M" (its eyebrow parts kept whole, the "·" ending its line, so no line starts with one; the category always takes its own line, the card being narrow at every width: "STOP 5 OF 9 · 3:30 PM" / "NEIGHBORHOOD"), Directions, Edit stop, and previous / next stepping that flies the camera. The day map's chip counts stops, as the day header does ("Day 1 · Kyoto · 9 stops", "6 of 9 stops" while some have no pin). Below 1024 px the card spans the foot of the map, so a stop flown to is framed above it (the fly-to's bottom padding is the card's height).
- The photoreal 3D view (`pages/Trips/photoreal/`, "Fly the day") is a separate full-screen mode on Google 3D Tiles, opened from a day's "…" menu as "Fly the day in 3D" when `photorealAvailable()` is true (a Google tiles / Places key and WebGL2; always in dev). It must unmount when closed.

## Pages

- **Index** (`/trips`): hero ("Where to *next?*") beside the ambient globe with one chip per trip. With three or fewer trips the cards sit in one row with no headings; from four they are bucketed Happening now / Upcoming / Past. Cards carry a mono countdown chip; a lifetime-figures strip (mono numerals, hairline separators) sits beside "Your trips". `/` focuses search, `n` opens create. Heading is never "Inbox".
- **Covers**: real map stills of the trip's stops, rendered by one off-screen MapLibre map (`renderStills`). The SVG chart (`components/TripCover.tsx`, from the summary's `points`) is the loading / no-WebGL fallback. No stock imagery.
- **Create** (`/trips/new`): destinations with city autocomplete (`components/CityField.tsx`), a custom date-range calendar (`components/DateRange.tsx`, also used in Trip details) with length presets (Weekend, 5 days, 1 week, 2 weeks), optional name, a "Draft the itinerary with AI" switch with a pace / interest brief, and a sticky submit row. No step circles. The map flies to each destination; on phones it is a small non-interactive strip under the title.
- **Workspace** (`/trips/:tripId`, `/trips/:tripId/day/:dayId`): `TripWorkspace` is an itinerary pane plus a sticky map. The full header shows on the overview only; day pages use a compact one-row header (trip name links to the overview, Share, ⋯ with "Improve whole trip with AI"). On phones the day's eyebrow leads with the trip name, a link to the overview that truncates first ("KYOTO IN THE LEAVES · DAY 1 OF 9 · TODAY"). Left / right arrow keys change day. Phones get a docked bottom bar with an Itinerary | Map switch (`radiogroup`) and the concierge button inside it.
- **Overview tabs** (`workspace/OverviewTabs.tsx`): text tabs with an ink underline under the day rail, `?tab=`. Panels: Itinerary (now card first: paper card, hairline frame, the trip-accent date tile as its one accent, the mono clock on the eyebrow's row so the day's name and sky line keep the full width, a mono countdown ("in 1 h 20", the one duration style the planner uses), serif stop name, and during the trip one sky line under the day's name: this hour's temperature and the wet spell under way or to come, "57° now · Showers 2–5 PM", or "Showers until 5 PM" once it has begun, else the day's sky word), Budget (`budget/`: serif total, one hairline meter with spent solid and planned hatched, category bars, expense rows with mono amounts), Checklist and Essentials (`prep/`: serif group headings, 44 px check rows drawn in brand when ticked, label / value rows for facts).
- **Day layouts**: List | Timeline segmented switch (`share.segment`; 36 px segments with a 44 px hit band; the selected one carries a 1 px `--trips-selected-edge`, which only dark sets). Timeline (`timeline/`): mono hour labels on a ruler of 1 px hour hairlines, blocks by minute with pin badges and category icons, travel connectors with a mode icon, mono "1 h 20 free", conflict badges; "Now" is a trip-accent hairline with a dot on the stop gutter in both layouts. The day always opens at the top, never scrolled for you: on today the stops already over fold into one dashed row instead ("4 stops done · 8:00 AM–1:30 PM", Show / Hide; `timeline/DoneFold.tsx`), in the list the leading run of finished stops (`dayList`'s `done`, headings and notes among them going too). Open or shut is one state for both layouts, shut on each visit; a stop in it that is selected (on the map, by a deep link), sent to its editor by the map's Edit stop, or holding focus opens it. A drag moves only what is shown; the folded head keeps its place. Day sky (`workspace/DaySky.tsx`): one left-aligned band under the title at every width, so the engraving holds its place from day to day: the sky's engraving (6.5rem, 4rem on phones) inked in `--trips-ink-secondary`, and on dark printed in dark ink on a feathered, lamp-lit oval of paper (light lines on dark paper read as a negative: a black sun, clouds lit from below); a mono "Forecast" eyebrow with "Sunrise 6:38 AM  Sunset 4:49 PM" in words beside it (phones keep the sunset), the high in Instrument Serif one clear step under the day's title (2rem, 1.5rem on phones) with the low smaller in tertiary, then the sky with its wettest window ("Showers 2–5 PM · 60% chance"; each " · " part kept whole on wrap) and, on a line of its own, what it means for the plan: "Falls on ⑤ Gion and Hanami-koji · 3:30–5:00 PM" at 600 (the stop by its badge, `StopRef`, a button that finds it; phones show the badge alone so the line stays one line) or "After your last stop" at 400, with the one action beside it, "Rework around the showers" in `--brand` ("Rework" on phones), while a stop it falls on is still ahead. A wet day with no hour at even odds says "Drizzle on and off · 45% chance" over "No hour more likely than not". One grid at every width: the engraving on the left, its lines beside it. Never tinted with either accent. The plan's expected weather is an estimate: eyebrow "Estimate · from the plan", a small tertiary "≈" before the high, which drops to secondary ink, and the engraving (with its plate) at 60%. A day in the forecast's reach with no forecast says "Not available right now" under the compass at 30%, with a "Try again" link in `--brand`. The overview's day rows keep a glyph, not the engraving (engravings do not read below about 3rem): a 20 px Lucide glyph in secondary ink, the high in the serif with the low smaller in tertiary (also the serif), and a mono chance of what falls under them from 30% ("60% showers", "70% snow", "90% storms"); snow has its own glyph (a snowflake), so it never reads as drizzle. A row title takes two lines before it truncates, and today's date tile reads "Today", ringed in `--ta` (not filled: 10 px white on most accent fills is under 4.5:1). Timeline weather: mono temperatures under every third hour label; likely rain as an 8 px hatched band in tertiary ink in the gutter between the hours and the stops, hanging from its sky's glyph (drawn over the band's head on the canvas, so it needs no room above the ruler; snow and storms draw their own; never over a stop), and a rain line on each stop it meets ("Showers until 5:00 PM · 60%") (the window itself is in the day sky); at 70% or a storm the band darkens to secondary and the stop's rain line turns ink at 600. Sunrise and sunset are dashed hairlines under the stops (seen between them), their dash starting at the stops, marked by their glyph in a slot of their own 4 px clear of the rain band; the day sky names them. Over the ruler a line appears only for clashes ("1 overlap", "1 tight leg", in ink with a warning glyph); the free time, the light and the rain are said once for screen readers, since the legs and the band already show them. An hour is 60 px, so a long stop stays a card rather than a tall empty box. The ruler runs from the first stop's hour to the last stop's end (three hours at least); on today it starts at the done fold's hour, and a stop that began earlier shows as running in from the top. Free time is what is left after the journey, labelled from 15 minutes, with when to set off on a line of its own ("12 min walk · 1 h 08 free" / "Leave by 3:18 PM"; the leg's line carries the wet glyph when the walk falls in a wet spell), and the summary adds up only labelled gaps; on today it counts from now. On today, stops already over go quiet (canvas fill, secondary title, outlined badge), and the Now label carries this hour's temperature, since it takes that hour's label. One card face and one grid: every title in the UI sans at the same indent; a stacked lane shows a bare "10:15–11:30" with the kind's icon, keeps up to three title lines and names an overlap by number in the longest form the lane fits ("Overlaps ②", else "②"; a container query on `.trips-lane`). Card times always keep their minutes ("3:30–6:00 PM"); prose collapses whole hours ("2–5 PM"). A flight or train with no end time shows "Departs 10:40 AM" over its usual length (45 minutes for a flight), never a guessed arrival.
- **Command palette** (`command/`): Radix dialog, combobox over a grouped listbox with mono group eyebrows, icon / title / muted subtitle / right-aligned `kbd` per row, the active row marked by a brand-ring edge, a mono hint footer hidden on phones. The shortcuts sheet is a kit `Modal`.
- **Print** (`print/`): portalled print root, hidden on screen; Instrument Serif headings, Fragment Mono times, hairline rules, pin numbers as small filled circles in the trip accent with contrast-chosen ink; no backgrounds or gradients.
- **Stop cards**: time column on the left (above the title on phones). The grip shows on hover / focus and is hidden on phones; Alt+↑ / ↓ reorders with a live announcement. The day menu offers "Sort stops by time" when times are out of order. Times use a typed `TimeField` (`parseClock`) with "Add end time"; the end time sits under the start, smaller, in tertiary ink. A card that overlaps an earlier stop says "Overlaps ②" or "Tight after ② · ~15 min by transit, no gap" in ink (the other stop by its map number, drawn as a copy of its badge, `timeline/StopRef.tsx`; "· +1" for more clashes), and one that meets likely rain says when ("Showers until 5:00 PM · 60%", "from 2:00 PM", "2–5 PM" when the spell falls inside the stop, "likely" when the stop falls inside the spell) in secondary ink, in ink at 600 from 70% or a storm (`workspace/stopAlerts.ts`, from the same layout the timeline draws); the card's rain glyph is its sky's, as on the timeline. "Rework around the showers" (named for what falls) lives in the day sky, not on a card, so both layouts have it; it opens Ideas briefed with the wet window and indoor places. A leg is drawn above the stop it leads into, so when Now falls in a gap it comes first and the walk ahead after it; between two timed stops it carries the timeline's words (`legWords`): "940 m · 12 min walk · 1 h 08 free", then "Leave by 3:18 PM" on its own line, each part of a line kept whole on wrap (`workspace/Parts.tsx`). The leg between two stops that overlap says "No time to travel" with a timer-off glyph, not a distance. The untimed stops after the last timed one sit under a mono "Anytime" eyebrow, with no time and no legs into or between them; an untimed stop between timed ones keeps its place and its legs (`workspace/dayList.ts`). On today, stops already over are set in secondary ink with an outlined badge, as on the timeline. Status chips (Booked, Optional, Needs review) are mono outline chips, never green, in the day list and the overview's Bookings alike.
- **Day rail** (`workspace/DayRail.tsx`): Overview is a fixed first column, then a hairline, then the days in their own scroller (which always rests on a whole day 12 px in from its start: start snap, a scroll quantised to day starts, and a tail sized so scrolling to the end rests on a whole day too), so centring a late day never hides Overview. The selected day sits as near the middle as that allows (the scroller moves, never the page), and the days fade only at an edge that can scroll: at the start over just those 12 px, so no day is ever cut mid-glyph against the rule.
- **Join** (`/trips/join/:token`): accept an invite link.
- **Concierge**: chat button on the workspace (`TripChat`, `chat.stylex.ts`), inside the bottom bar on phones. Message column with a live status line (brand accent), compact place cards (photo or category tile, rating, hours, walk from the plan, dated "Add to …" primary), one proposal card per batch of changes (mono times, per-row ticks, Apply, then Undo), source chips and follow-up chips as outline pills. The stream caret and every AI affordance use the brand accent, never the trip accent.
- **Instagram import**: a two-pane sheet (`instagram/InstagramSheet.tsx`): paste field, Posts / Saved tabs and place rows on the left, a top-down map of the places on the right (a strip on phones). Paper-grid placeholder until a post has places. Place tiles and pins use the trip accent; progress and actions use the brand accent. Imported places without a time sit under a mono "To schedule" header on the day and show as unnumbered dots on the map.
- **Photoreal 3D ("Fly the day")**: full-screen over Google 3D Tiles. Paper veil with a mono progress chip while tiles settle; numbered pins with stem and ground ring; hollow pins for "To schedule" places; thin route arcs with distant legs faded; pinned stop card (photo, mono eyebrow, serif name) above a compact stop list on desktop, chip rail plus bottom card on phones. "From Instagram · Open the post" on imported places.
- **Icons**: sparkle = AI generation, lightbulb = "Ideas for this day" (an outline button in brand ink beside the layout switch, no soft fill), chat glyph = concierge.

## Styling

- `atlas.stylex.ts`: primitives `a` (type, buttons, fields, chips, pills, menu, dialog). Compose these before writing new styles: `{...sx(a.btn, a.btnPrimary)}`.
- `index.stylex.ts`: `shell`, `idx`, `cover`, `create`. `workspace.stylex.ts`: `share`, `ws`. `map/map.stylex.ts`, `chat.stylex.ts`.
- `components/kit.tsx`: `Menu`, and `Modal` (Radix dialog that becomes a bottom sheet on phones). `Modal` re-declares the `.trips` token scope on its portal via `.trips.trips-portal`, so portaled content still resolves `--trips-*` / `--brand-*` / `--ta-*`.
- `meta.ts`: pure date / accent / icon helpers. `useTripEditor.ts`: document state, autosave and AI runs.
- `index.css` `.trips` block owns tokens, accents, `.atlas-pin*`, MapLibre chrome overrides and the few rules StyleX can't express.

## Liquid Glass (opt-in look)

Code: `pages/Trips/glass/`. Design intent and where it is off: `PRODUCT.md`, "The Liquid Glass look". Everything is scoped to `:root[data-trips-look="glass"]` in `glass/glass.css` (unlayered, so it wins over the StyleX it reskins) and excluded from `.trips-glass-off`, `.trips-print-root` and `.trips-recap-print-root`.

**Materials** (class hooks, inert in the atlas):

| Class | On | Tint (light / dark) | Blur |
|-------|----|---------------------|------|
| `.trips-glass-bar` | header, day rail, phone dock | `--trips-glass-tint-bar`: white .58 / `rgb(30 33 42 / .72)` | 10px |
| `.trips-glass-pill` | map controls, map chip, concierge button (brand-tinted) | `--trips-glass-tint-pill`: white .56 / `rgb(34 37 46 / .7)` | 4px |
| `.trips-glass-sheet` | Modal, Menu, ⌘K, place card, concierge, Instagram sheet, date picker | `--trips-glass-tint-sheet`: `rgb(252 252 254 / .8)` / `rgb(26 29 37 / .86)` | 30px |

All three add `saturate(1.9)` and a brightness lift (1.06 light, 0.9 dark), the `--trips-glass-shadow` (inner glow, soft drop) and a 1px specular rim (`::before`, a conic gradient from `--tg-light`; `light.ts` writes that angle on the surfaces themselves, a registered property that does not inherit, so a pointer move restyles a dozen elements rather than the page). In Chromium, `refraction.ts` writes `--tg-refract: url(#tg-lens-N)` (a registered, non-inheriting property) on at most twelve on-screen surfaces, pills first, and the CSS puts it ahead of the blur; the bezel is 14 / 16 / 22 px and the largest shift 12 / 14 / 16 px for pill / bar / sheet. Modifiers: `.trips-glass-dock` and `.trips-glass-rail` (the capsules), `.trips-glass-segment` and `.trips-glass-tabs` (track `--trips-glass-track`, thumb `--trips-glass-thumb`), `.trips-glass-map` (the phone map runs under the dock).

**Tokens it changes** (light / dark): canvas `#eef1f6` / `#0b0f18` (stays opaque: it is ink buttons' text and every focus ring's gap); surface white .6 / `rgb(40 44 54 / .56)`; raised white .86 / `rgb(46 50 61 / .9)`; sunken `rgb(118 118 128 / .12)` / `.22`; line `rgb(60 60 67 / .12)` / `rgb(235 235 245 / .1)`; tertiary ink `#4f545b` / `#9a9fa6`; `--brand` `#9a3409` (light); `--ta` takes `--ta-strong` (light); radii 1.25 / 0.875 / 1.75rem; `--trips-chrome-h` 3.75rem (the header floats 8px down); display, text and mono faces become the system face. Shadows gain a top inner highlight.

**Wallpaper**: `GlassLayer` (lazy) paints `wallpaper.ts`'s shader once per size class, theme and accent (the trip in `#trips-main`, else brand), at half the viewport, to a WebP still, then releases the context (`WEBGL_lose_context`). `palette.ts` holds it in its luminance band.

**Preferences**: `prefers-reduced-transparency` → solid (`--trips-glass-solid`), no wallpaper; `prefers-contrast: more` → solid plus 1px `--trips-line-strong` edges; `prefers-reduced-motion` → light at rest, no press squish.

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
- Stack glassmorphism, use gradient text, stock travel photography, or generic SaaS dashboard chrome. (The opt-in Liquid Glass look is one layer of glass over content, never glass over glass.)
- Put two maps in one viewport.
- Tint chrome (focus rings, AI actions, switches, links) with the trip accent, or trip identity with the brand.
- Add destination-specific routes, or restyle Trips into the Korea dossier.
- Hide the photoreal 3D view with React `Activity`. Unmount it.
