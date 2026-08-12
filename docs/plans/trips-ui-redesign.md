# Trips App UI Redesign Plan

Holistic UI analysis and redesign plan for the multi-trip travel planner (`/trips/*`), produced with the impeccable skill (product register) on a live run of the app. This document is the handoff artifact for implementation agents: every workstream is self-contained, has explicit file targets, exact changes, and acceptance criteria.

**How this was produced.** Three independent inputs, synthesized:

1. Code-level audit of every file in `frontend/src/pages/Trips/` (3,924 lines) plus shared tokens in `frontend/src/index.css` and routing in `AppRoutes.tsx`.
2. A live visual review: the full stack was run locally (dev-bearer auth bypass, seeded `korea-2026` trip) and every screen was captured in light/dark and desktop/mobile (20 screenshots).
3. The impeccable deterministic slop detector (`npx impeccable detect`) over the Trips source.

The critique snapshot is persisted at `.impeccable/critique/` for future re-runs.

---

## 1. Scope and guardrails

### In scope

| File | Lines | Role |
|---|---|---|
| `frontend/src/pages/Trips/TripsLayout.tsx` | 96 | Shell: header, auth gate, skip link |
| `frontend/src/pages/Trips/TripsIndex.tsx` | 304 | Trip list |
| `frontend/src/pages/Trips/TripCreate.tsx` | 363 | Create form (blank / AI) |
| `frontend/src/pages/Trips/TripOverview.tsx` | 496 | Read-only dossier page |
| `frontend/src/pages/Trips/TripDayPage.tsx` | 494 | Read-only day page |
| `frontend/src/pages/Trips/TripDetail.tsx` | 1,529 | Itinerary editor (monolith) |
| `frontend/src/pages/Trips/theme.ts` | 227 | Accent themes, status meta, emoji icon maps |
| `frontend/src/pages/Trips/ui.ts` | 52 | Shared class-string vocabulary |
| `frontend/src/pages/Trips/components/DateRangeField.tsx` | 287 | Custom range calendar |
| `frontend/src/pages/Trips/components/TimezoneField.tsx` | 224 | Timezone combobox |
| `frontend/src/index.css` (`.trips` block, ~lines 818–864) | | Trips tokens + fonts |

### Out of scope (do not touch)

- `frontend/src/pages/Korea/**` including `MapModeOverlay` internals. The Trips day pages consume it via the `placesUrl` prop contract; that contract must not change.
- `server/**`. No API shape changes. All redesign work is presentational and client-side.
- The document data model (`types.ts` shapes mirror `server/src/trips/types.ts`). Adding purely presentational helpers to `theme.ts`/`ui.ts` is fine; changing `Trip`/`ItineraryItem` is not.
- `frontend/e2e/**` (Playwright-owned) and the vitest exclusion in `vitest.config.ts`.

### Verification gate (every workstream, before pushing)

```bash
# from repo root
KLUSTER_API_KEY=ci-stub KLUSTER_API_BASE_URL=https://example.invalid IG_WORKER_ENABLED=false \
  bun test --bail server/src
cd frontend && bun run typecheck && bun run build && bun run test:run
```

### Running the app for visual verification

The Trips routes are Clerk-gated, but there is a dev bypass. This exact recipe works in a fresh sandbox:

```bash
bun install && (cd frontend && bun install)
printf 'VITE_DEV_BEARER=local-review-bearer\n' > frontend/.env
KLUSTER_API_KEY=ci-stub KLUSTER_API_BASE_URL=https://example.invalid \
  IG_WORKER_ENABLED=false IG_DEV_BEARER=local-review-bearer bun server/app.ts &
(cd frontend && bun run dev)   # http://localhost:5173/trips
```

Supabase env is absent, so the server uses the in-memory store and seeds the full 12-day `korea-2026` trip on the first `/api/trips` request. That trip is the realistic test fixture: long name with punctuation, 12 days, reservations, sections, notes with Korean place names, callouts, weather. Always verify against it, plus an empty blank trip.

Per the repo PR rule, capture screenshots of every changed page (light + dark, desktop + ~390px mobile) and attach them to the PR.

---

## 2. Current state assessment

### Design health score (Nielsen heuristics, 0–4 each)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Autosave pill, skeletons, busy labels are good; editor day rail has no active state; 30s AI generation has only a static text hint |
| 2 | Match system / real world | 3 | Travel language is natural; "Enhance", "Eyebrow", "Headline" are internal jargon leaking into UI |
| 3 | User control and freedom | 2 | Item delete is instant with no confirm or undo; error recovery via `window.alert` and full-page reload |
| 4 | Consistency and standards | 2 | Two button systems (rounded-xl `ui.ts` vs rounded-full editor-local), two icon systems (Lucide + emoji), dossier accent vs hardcoded amber editor chrome, three different badge treatments |
| 5 | Error prevention | 3 | Good form validation, date constraints, autosave + beforeunload guard; no undo anywhere |
| 6 | Recognition rather than recall | 2 | Unlabeled timeline dots (filled = has coordinates: nobody can guess), "More" hides time/status/location, "Day details" disclosure is nearly invisible |
| 7 | Flexibility and efficiency | 2 | ⌘↵ in enhance prompt and calendar arrow keys exist; no bulk actions, no drag reorder, no other shortcuts |
| 8 | Aesthetic and minimalist design | 3 | Dossier pages are genuinely strong; editor item rows carry 7 competing elements; index page is 80% empty canvas |
| 9 | Error recovery | 2 | Raw `err.message` strings shown to users; "Retry" buttons call `window.location.reload()` |
| 10 | Help and documentation | 2 | Good inline hints on the create form; zero explanation of dot semantics, Enhance behavior, or status vocabulary |
| **Total** | | **24/40** | **Acceptable: significant improvements needed** |

### Technical audit score (0–4 each)

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Strong baseline (skip link, focus rings, reduced motion, labels). Gaps: editor icon buttons ~30px, `aria-pressed` misused on calendar days, inline alertdialog without focus management, no `aria-current` in day rail |
| 2 | Performance | 3 | Good lazy chunking. Editor re-renders the entire 12-day tree on every keystroke (no memoized rows) |
| 3 | Responsive design | 2 | Mobile editor loses day navigation entirely (rail is `hidden lg:block`); item rows truncate titles with no affordance; cramped 7-element rows at 390px |
| 4 | Theming | 2 | `--trips-*` CSS variables exist but components hardcode `stone-*`/`amber-*` Tailwind literals everywhere; `--trips-accent` (#b45309) diverges from the amber-800 actually used |
| 5 | Anti-patterns | 3 | Mostly clean. Tells: emoji icon system, six-hue badge rainbow in the suggestions panel, mixed pill/rounded-xl radii |
| **Total** | | **13/20** | **Acceptable: significant work needed** |

### Anti-pattern verdict

**Does it look AI-generated? Partially, and only in specific places.** The dossier pages (overview, day) read as designed: editorial serif display, mono eyebrows, hairline rules, restrained accents. What breaks the illusion:

- **Emoji as an icon system** (`reservationTypeIcon`, `placeCategoryIcon` in `theme.ts`): ✈️🏨🍴🍸 render differently per platform, clash with the Lucide stroke icons used everywhere else, and read as "prototype".
- **Badge rainbow**: `SUGGESTION_BADGE` uses emerald, sky, red, violet, amber, and stone chips in one panel; plus a violet "AI" pill on item rows. Six hues in a "restrained" product.
- **Two component vocabularies**: `ui.ts` defines a rounded-xl amber-800 system, but the editor (`TripDetail.tsx`) never imports it and instead uses local rounded-full amber-700 buttons. The same product speaks two dialects on adjacent pages.
- Deterministic detector: 6 `gray-on-color` warnings. Four are false positives (light/dark class pairs the regex can't separate). Two are real: `text-stone-400` hover states over `bg-red-50` in `TripDetail.tsx:1396` and `TripsIndex.tsx:269`.

### Rendering bugs found in the live run (fix regardless of redesign)

1. **Hero title wraps one word per line** (`TripOverview.tsx:137`). `max-w-[18ch]` sits on the `h1`, whose computed font-size is the 16px base, so the cap is ~130px, not 18 display-size characters. "South Korea — Seoul + Busan" renders as six stacked lines on desktop. The `ch` cap must live on the same element as the `clamp()` font-size.
2. **Hero bloom has a hard rectangular edge.** The overview header uses `-mx-4` to break out of `<main>`'s padding, but `<main>` is `max-w-6xl mx-auto`, so on viewports wider than 1152px the rose/amber radial bloom stops at an abrupt vertical line. The signature gradient must bleed to the viewport edge.
3. **Editor day-title input truncates silently.** "Arrival & Easy Gangnam Evening" shows as "Arrival & Easy Gangnam Eveni" with no ellipsis or wrap (single-line `<input>`).
4. **Dead interactive element**: `TripsIndex.tsx:292–301` renders an `sr-only` cancel button with an `X` icon outside the confirm row. Screen-reader users encounter a phantom "Cancel delete" button at the end of the page.
5. **Duplicate status in hero**: the status line ("Concluded") and the raw `trip.status` chip ("completed") sit side by side saying the same thing twice.

### What genuinely works (preserve, do not regress)

- **The dossier language**: Cormorant display + Fragment Mono eyebrows + hairline dividers + numbered sections ("01 — Booked moments"). This is the app's identity. Extend it, never dilute it.
- **Dark mode** is first-class and deliberate everywhere.
- **The custom `DateRangeField` and `TimezoneField`**: dependency-free, keyboard-navigable, well-crafted. Keep both; they need only minor a11y adjustments.
- **The autosave model** (debounced PATCH + floating save pill + beforeunload flush) is the right interaction; only the pill's copy and error path need work.
- **Reduced-motion discipline** is thorough (`useReducedMotion` everywhere) and must remain so in all new work.

---

## 3. Design direction (the north star)

**Register**: product. The editor and forms must disappear into the task. The overview/day pages are the one "brand moment" the product earns: a personal travel dossier the owner shows their partner. Two intensities, one system.

**Scene sentence**: a traveler on their phone outside a Seoul subway exit at 9pm checking tonight's reservation, and the same person on a laptop three months earlier, planning with coffee. Both light and dark stay first-class; light is the planning default, dark is the in-trip default. (Unchanged from today; the theme toggle already handles it.)

**Color strategy**: Restrained, with a per-trip Committed accent on trip-scoped surfaces.

- **App chrome** (shell, index, create form): tinted stone neutrals + amber as the single interactive accent, ≤10% of any viewport. This is what `ui.ts` already does; it becomes law.
- **Trip-scoped surfaces** (overview, day page, editor): the trip's chosen accent (`appearance.accent`, resolved by `resolveAccent`) drives every accent moment: countdown numerals, dots, section numbers, focus rings, primary action tint. Today the overview honors it but the editor hardcodes amber, so a rose trip changes personality when you hit Edit. That split is the single biggest coherence bug in the app.
- Semantic colors stay semantic and minimal: emerald = confirmed/booked (matches the Korea token table), amber = pending/needs attention, red = destructive/error. Everything else is neutral.

**Typography** (product register rules):

- Cormorant Garamond only for display moments: trip names, day titles, big day numerals, section headings on dossier pages. Never in the editor's data rows, buttons, or labels.
- Inter for all UI. Fragment Mono for eyebrows, timestamps, and tabular metadata only.
- Fixed rem scale in the editor (no `clamp()` there); fluid clamp scale stays on dossier pages only.

**Component vocabulary**: one. Everything interactive comes from `ui.ts` (extended in WS1). Radius vocabulary: `rounded-xl` for buttons/inputs/panels, `rounded-full` reserved for dots, avatar-like swatches, and the floating save pill. No other pill buttons.

**Iconography**: Lucide only, `strokeWidth={1.5}`, one size scale (14/16px). User-entered emoji (day emoji field) is content and stays.

**Motion**: state-conveying only, 150–250ms, the existing `EASE` curve. Keep the entry fades on dossier pages (they serve orientation), delete none of the reduced-motion handling. No new orchestrated sequences.

---

## 4. Workstreams

Ordered by dependency. WS1 and WS2 unblock everything; WS3–WS7 are parallelizable after them (they touch disjoint files, except all consume WS1's vocabulary). One implementation agent per workstream is the intended split. Each workstream lands as its own commit (or PR) with screenshots.

---

### WS1 — Foundation: one vocabulary, one accent system, one icon set

**Files**: `theme.ts`, `ui.ts`, `index.css` (`.trips` block), then mechanical adoption in all six page files.

**1a. Accent system via CSS variables.** Replace the five hand-written `ACCENTS` Tailwind-literal records with a data-attribute + CSS variable scheme so the accent applies to trip-scoped pages once, editor included:

- In `index.css`, under the `.trips` block, define per-accent variable sets:

```css
.trips [data-trip-accent="rose"] {
  --ta: oklch(58% 0.19 18);        /* accent text/dot, light */
  --ta-strong: oklch(50% 0.19 18); /* hover/pressed */
  --ta-soft: oklch(58% 0.19 18 / 0.12);  /* tint backgrounds */
  --ta-ring: oklch(58% 0.19 18 / 0.45);  /* focus rings */
  --ta-bloom-a: oklch(58% 0.19 18 / 0.10);
  --ta-bloom-b: oklch(75% 0.15 75 / 0.07);
}
html.dark .trips [data-trip-accent="rose"] { /* lighter values, e.g. oklch(70% 0.16 18) */ }
/* repeat for amber, emerald, sky, violet — keep hues aligned with the current
   rose-500/amber-500/emerald-500/sky-500/violet-500 anchors, but define them
   as OKLCH with chroma reduced at the light/dark extremes */
```

- `TripOverview`, `TripDayPage`, and `TripDetail` wrap their content in `<div data-trip-accent={resolveAccent(trip.appearance?.accent)}>`.
- Components use arbitrary-value utilities against the vars: `text-[color:var(--ta)]`, `bg-[color:var(--ta-soft)]`, `focus-visible:ring-[color:var(--ta-ring)]`, etc. Keep a slimmed `AccentTheme` in `theme.ts` exporting these composed class strings (so call sites stay one-word), but its five records collapse to one.
- The hero blooms become two utility classes in `index.css` (`.trip-bloom-a`, `.trip-bloom-b`) reading `--ta-bloom-*`, replacing the ten inline `radial-gradient` literals.
- **Editor adoption is part of this task**: every `amber-*` accent literal in `TripDetail.tsx` (day header eyebrow, timeline dots, enhance buttons, focus rings, flash highlight) switches to the `--ta` classes. App-chrome amber (shell header, index, create) stays amber via `ui.ts`.

**1b. Icon system.** In `theme.ts`, replace `reservationTypeIcon` and `placeCategoryIcon` (emoji strings) with Lucide component maps:

```ts
import { Plane, BedDouble, UtensilsCrossed, Martini, Ticket, TrainFront,
  CalendarClock, PartyPopper, Landmark, Coffee, ShoppingBag, Trees,
  Building2, MapPin, StickyNote, Church, Store, Camera } from "lucide-react"

export const reservationTypeIcon: Record<string, LucideIcon> = {
  flight: Plane, hotel: BedDouble, meal: UtensilsCrossed, bar: Martini,
  experience: Ticket, transit: TrainFront, event: PartyPopper,
  appointment: CalendarClock, wedding: Church,
}
// placeCategoryIcon similarly; fallback MapPin; note → StickyNote
```

`itemIcon()` returns a component; call sites render `<Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />`. Update `TripOverview.tsx:475` (ReservationRow), `TripDayPage.tsx` (ReservationTimelineItem icon tile, NarrativeItem markers), and any editor usage. The `DayCallout.icon` field and `day.emoji` are user data: still rendered as text.

**1c. Status system.** One `<StatusChip status={item.status} />` helper (a function in a new `frontend/src/pages/Trips/components/StatusChip.tsx` is fine) with the dot + label treatment from `itemStatusMeta`, used by TripsIndex, TripOverview, TripDayPage, and TripDetail. Delete the editor-local `STATUS_CHIP` record. Colors: booked = emerald tint, needs_review = amber tint, optional/completed = stone. The suggestions `SUGGESTION_BADGE` rainbow collapses to three: add = emerald tint, remove = red tint, everything else (edit/reorder/warning/info) = stone tint with the kind spelled out. The violet "AI" pill becomes a stone-tinted pill with a 3px accent dot.

**1d. Buttons and inputs.** Extend `ui.ts` with the missing pieces so `TripDetail.tsx` can drop all local class strings: `chipBtnClass` (small bordered action, min-h-9, rounded-lg: the Maps/Call/Booking style already in TripDayPage), `iconBtnClass` (44×44 target, rounded-xl), `subtleInputClass` (the borderless inline-edit input), `selectClass`. Sweep all six pages to consume only `ui.ts` classes for interactive elements. Every `rounded-full` button in the editor and GeneratePanel becomes `rounded-xl` via `primaryBtnClass`/`secondaryBtnClass`.

**1e. Detector fixes.** `TripDetail.tsx:1396` and `TripsIndex.tsx:269`: the destructive icon-button hover uses `text-stone-400` as the resting color over a `hover:bg-red-50`; change hover state to `hover:text-red-700` on both (already half-done in one) and rest color stays stone on transparent. Re-run `npx impeccable detect frontend/src/pages/Trips` and get it to 0 true positives.

**Acceptance criteria**

- `rg "🍴|✈️|🏨" frontend/src/pages/Trips` returns nothing.
- `rg "rounded-full" frontend/src/pages/Trips` matches only dots, swatches, and the save pill.
- Editor accent follows the trip accent: set the Korea trip to rose in Appearance, confirm editor dots/eyebrows/buttons are rose in both themes.
- One `ACCENTS`-style record remains (class-string compositions over `--ta` vars), no per-accent duplication.
- Detector: 0 non-false-positive findings. Verification gate passes.

---

### WS2 — P0/P1 bug fixes (small, surgical, ships first)

**Files**: `TripOverview.tsx`, `TripsLayout.tsx`, `TripsIndex.tsx`, `TripDetail.tsx`.

1. **Hero title wrap** (`TripOverview.tsx:137–146`): move the width cap onto the sized span: `<span className="block max-w-[16ch] font-display text-[clamp(2.5rem,7vw,4.25rem)] …">`. Remove `max-w-[18ch]` from the `h1`. Long names must wrap at natural word boundaries into at most 2–3 lines at 1440px. Verify with the seeded trip name.
2. **Full-bleed hero**: make `TripsLayout`'s `<main>` unconstrained (`px-0 pb-28`) and move `mx-auto max-w-6xl px-4 sm:px-6 pt-8` wrappers into each routed page (TripsIndex, TripCreate get a `max-w-6xl` / `max-w-2xl` wrapper; TripOverview keeps its internal `max-w-6xl` sections and drops the `-mx-4 -mt-8` hack). The bloom then spans the viewport with no hard edge. Check the sticky create-form footer still aligns.
3. **Dead sr-only cancel button**: delete `TripsIndex.tsx:292–301`. Instead give the inline confirm row an Escape handler and move focus to the Cancel button when it opens (see WS8 for the full focus pass; the deletion happens here).
4. **Duplicate hero status**: remove the raw `trip.status` chip from the hero (`TripOverview.tsx:124–134`); keep the accent status line ("12 days to go" / "Day 3 of 12" / "Concluded"). Trip status stays visible in the editor header select and on the index rows.
5. **`window.alert` on delete failure** (`TripsIndex.tsx:103`): replace with an inline `alertErrorClass` row in place of the confirm strip, with a Retry button.
6. **Retry via reload** (`TripOverview.tsx:64`, `TripDayPage.tsx:91`): re-run the fetch (extract the loader into a callback with a `reloadKey` bump, exactly like TripsIndex already does) instead of `window.location.reload()`.
7. **Editor date consistency**: `TripDetail.tsx:81–87` `formatDayDate` parses `T00:00:00` local; overview uses trip-timezone helpers. Replace with `formatTripDate(iso, trip.timezone)` (thread `timezone` down or capture it in scope).

**Acceptance criteria**: hero renders the seeded trip name on ≤3 lines at 1440px and mobile; bloom reaches viewport edges at 1920px; no `window.alert` / `window.location.reload()` under `frontend/src/pages/Trips`; verification gate passes.

---

### WS3 — Trips index: from empty beige to a working surface

**File**: `TripsIndex.tsx` (+ `ui.ts` consumers).

The page currently floats one 60px row in an empty viewport, and its per-row facts duplicate each other (the DateMark repeats the date range text beside it).

1. **Header stays compact** and left-aligned as-is, but the intro sentence goes ("Plan days, keep reservations straight…" restates the product; the page teaches itself). Keep eyebrow + `Your trips` + New trip button.
2. **Trip rows become the hero.** Upgrade each row so the list carries visual weight without becoming a card grid:
   - Left column: replace the single-date `DateMark` with a **countdown/state mark**: upcoming trips show `T–{n}` days in mono over the accent color; in-progress shows `Day {k}/{n}` with the accent dot; past shows the year in stone. This is the most decision-relevant fact and currently absent.
   - Title line: name (semibold Inter, not serif: product register) + `StatusChip` from WS1.
   - Meta line: destinations, date range, `{dayCount} days · {itemCount} stops` (itemCount is already in `TripSummary` and currently unused).
   - Use the trip's accent (`data-trip-accent` per row is unnecessary; a small inline dot using the summary's appearance accent is not in `TripSummary`, so keep the accent-neutral stone/amber treatment here).
3. **Section headers** ("In progress / Upcoming / Past") keep the mono eyebrow style; add the accent hairline (`h-px w-8`) used by dossier section headers for family resemblance.
4. **Empty state**: keep the two CTAs, replace the dashed box with an editorial empty state in the dossier voice: big serif "Where to next?", one line, the two buttons; add a subtle bloom (`.trip-bloom-a` at low opacity) so the first-run screen carries the product's signature rather than a gray dashed rectangle.
5. **Single-trip case** (the common one): after the buckets, if only past trips exist, render a quiet inline prompt row: mono eyebrow "Next" + ghost "Plan a new trip →" link. Kills the dead-space problem without inventing content.
6. **Delete confirm**: keep inline (correct pattern), tighten to one line on desktop, and manage focus (WS8 wires the details).

**Acceptance criteria**: at 1440×900 with one past trip, meaningful content (header, section, row, next-trip prompt) occupies the upper half; no information appears twice in one row; screenshots light/dark/mobile attached; verification gate passes.

---

### WS4 — Create form: guided, not a checklist

**File**: `TripCreate.tsx` (+ `components/`).

The bones are good (validation summary, parsed-destination chips, sticky action bar). Fixes are hierarchy and jargon:

1. **Mode picker**: the two radio cards get unequal weight. "AI draft" is the recommended default: give it the amber-tinted selected treatment plus a small "Recommended" mono tag; "Blank days" stays quiet. Cards keep full borders (no side-stripes).
2. **Progressive disclosure order**: Essentials panel first (name, destinations, dates, timezone), then the mode picker ("How should we start it?"), then the AI brief only when AI is selected. Rationale: users decide *what* the trip is before *how* to seed it; today the mode question interrupts before they've typed a name.
3. **AI brief**: pre-filling the textarea with `DEFAULT_ITINERARY_PROMPT` makes users read boilerplate. Leave the textarea empty with the default as `placeholder`, and send `undefined` when blank (server already applies its default).
4. **Preferences grid**: fine as-is behind the disclosure; change the toggle to a `secondaryBtnClass` small button (currently a bare text link, the only underline-affordance button in the app).
5. **Copy pass**: "Prefer the destination zone so 'today' and countdowns stay accurate" → "Use the destination's time zone"; hint styles stay. Remove the em dashes in UI strings (skill copy rule): "Empty days for each date — build it yourself." → "Empty days for each date. Build it yourself."
6. **Generation wait**: during `busy === "generating"`, the sticky bar's helper line gets a determinate feel: keep `role="status"` and add the elapsed-seconds counter ("Generating… 12s · usually 20–40s"). No fake progress bar.

**Acceptance criteria**: tab order matches visual order; the form reads top-to-bottom as what → when → how; blank AI brief sends no prompt; screenshots attached; verification gate passes.

---

### WS5 — Trip overview (dossier): protect the crown jewel, tighten it

**File**: `TripOverview.tsx`.

WS2 already fixed the title wrap, bloom bleed, and duplicate status. Remaining:

1. **Hero density**: reduce hero vertical padding (`pb-10 pt-10 sm:pb-12 sm:pt-14` → `pb-8 pt-8 sm:pb-10 sm:pt-10`) and cap the display size at `4.25rem` so the day list is reachable within one screen at 900px height.
2. **Meta row**: "Sharing: All signed-in users" is owner-config noise on a read surface; show Sharing only when `collaborators.length > 0` (named count), else omit. Timezone stays. The `migrated` tag (from `trip.tags`) is system lint: filter tags rendered in the hero to exclude `migrated`.
3. **Today ribbon** (`todayDay` aside): good idea, weak affordance. Give it the accent-soft background tint (`bg-[color:var(--ta-soft)]`) instead of border-only so it reads as the one interactive "now" element, and append a trailing `ArrowUpRight`.
4. **Day rows**: keep the editorial layout exactly. Two fixes: the two-digit day numeral and the city tag column widen to `w-16 sm:w-20` so weather/booked metadata never collides at 390px; and `isPast` rows at `opacity-55` fail contrast: use `opacity-70` plus stone-500 text instead.
5. **Reservations section**: rows currently link to the day page with no indication which of the day's items they are. Append `#item-{item.id}` to the link and give the day page an anchor + brief accent-tint highlight on arrival (mirror of the editor's flash; respect reduced motion with a static ring).
6. **Editorial rhythm**: the section header component (`SectionHeader`) is duplicated in TripOverview and TripDayPage with tiny differences: extract one `DossierSectionHeader` into `components/` and use it in both (feeds WS6).

**Acceptance criteria**: hero + today ribbon + first two day rows visible at 1440×900; past-day rows pass 4.5:1; reservation row click lands on the highlighted item on the day page; screenshots attached; verification gate passes.

---

### WS6 — Day page: in-trip lookup speed

**File**: `TripDayPage.tsx`.

This page's job is the 9pm-outside-the-subway lookup. It's close; sharpen the scan path:

1. **Header stack**: the giant accent numeral + emoji + title row works. Drop the `animate-pulse` on the "live" dot (decorative pulse; the accent dot + label already communicates it) or keep a single 2-frame opacity fade; either way it must respect reduced motion (it currently does via `motion-reduce:animate-none`; simplest is to remove the pulse).
2. **Reservation timeline cards**: adopt WS1 icons (the emoji tile becomes a Lucide icon in a `bg-[color:var(--ta-soft)]` tile). The time belongs inside the card header line, right-aligned in mono, not floating above the card (two anchors for one fact today: rail dot + floating time).
3. **Action chips** (Maps / Call / Booking): keep; they're the most-used elements in the field. Bump to `min-h-11` on mobile via the WS1 `chipBtnClass`.
4. **Narrative blocks**: `block.section.notes` bullet lists strip the leading `-` manually and render custom dot markers: fine. One change: link-colored addresses under `NarrativeItem` get `break-words` (long Korean addresses overflow at 390px today, e.g. day 2's Apgujeong entries) — verify with the seeded trip.
5. **Prev/next nav**: keep, add `rel="prev"/"next"`; on mobile stack them with the next-day link first (thumb priority: forward beats back).
6. **Anchor highlight**: implement the `#item-…` target from WS5 (scroll into view + one-time accent-soft background fade).

**Acceptance criteria**: at 390px, no horizontal overflow anywhere on the seeded day 1 and day 2 pages; reservation card scan order is icon → title → status → time in one line each; screenshots attached; verification gate passes.

---

### WS7 — Editor redesign (the big one)

**File**: `TripDetail.tsx` (1,529 lines). Split it as part of this work: extract `GeneratePanel`, `EnhanceButton`, `AppearancePanel`, `DayCard`, `ItemRow`, `SuggestionsPanel`, `FloatingSaveIndicator` into `frontend/src/pages/Trips/editor/` modules. No behavior change from the split itself; it makes the below reviewable.

**7a. Page header.** Adopt `ui.ts` buttons. The header currently exposes View / status select / Publish / Enhance in one row of four mismatched controls. Regroup: left = trip name input + meta line (unchanged); right = `View` (secondary) and `Enhance trip` (primary, accent). Status moves into the meta line as a `StatusChip`-styled select (quiet, bordered on focus only), and **Publish** stays a distinct emerald-tinted button only while `status === "draft"` (it's the one state-advancing action and deserves its slot).

**7b. Day rail (desktop) gets an active state and richer scent.**

- Scroll-spy via `IntersectionObserver` on the day sections; the active day gets `aria-current="true"`, accent text, and a 1px accent hairline on the rail border segment. (Full borders/hairlines only; no >1px side-stripe.)
- Each rail item shows `Day n`, the date, and a tiny mono booked-count when > 0.
- **Mobile day nav (new)**: below `lg`, render a sticky horizontal chip rail (`overflow-x-auto`, snap) under the header with `D1…D12` chips, same scroll-spy state. The mobile editor currently has no way to jump between days: this is the single biggest mobile usability fix in the app.

**7c. Day card header.** Eyebrow (Day n · date · city) switches to accent var. The emoji + title inputs stay inline-editable, but the title input gets `title={day.title}` and, on blur states where it overflows, an ellipsis is acceptable **in edit mode only** because the full value is one click away; additionally widen it by moving Enhance/Map buttons to their own row on <sm. "Day details" disclosure becomes a real `secondaryBtnClass`-styled small button labeled `Details` with a chevron, not 11px ghost text.

**7d. Item rows: two-line grid, legible semantics.** Restructure `ItemRow`'s collapsed state into a CSS grid:

```
[marker] [time (mono, fixed 3.5rem, right)] [icon] [title …] [status chip] [chevron]
                                            [meta line: location name · mapped ✓ / no pin]
```

- The **timeline marker semantics get labeled**: the filled/hollow dot is replaced by a small `MapPin` (filled accent when coordinates exist) with `title`/`aria-label` "On the map" / "No coordinates yet". The rail line stays.
- Second line (only when it has content): location name, and for unmapped places a quiet amber "no pin yet" hint: this surfaces the #1 data-quality task (getting places mapped) without expanding.
- "More" becomes a 44×44 chevron `iconBtnClass` with `aria-expanded`; the whole first line (except inputs) is also click-to-toggle.
- The AI pill and status chip stay on the first line but use WS1's restrained chips; on <sm they move to the meta line instead of disappearing (`hidden sm:inline` today hides state on phones).
- Section rows: full-width stone-tinted band with uppercase mono text and an optional time on the right: visually a divider, not a boxed row (remove the border/card treatment for `kind === "section"`).

**7e. Expanded item editor.** Keep progressive disclosure, fix the fiddle:

- Fields in a labeled 2-col grid: Times (start/end) | Status; Notes full-width; Location name | Address; coordinates line unchanged.
- Every control gets a visible 11px mono label (the current icon-only row of move/duplicate/convert/delete buttons keeps icons but gains a visible group label "Move · Duplicate · Delete" pattern via tooltips is not enough: give the destructive delete a text label `Delete`).
- **Delete gets undo instead of nothing**: on delete, remove the item and show a 6-second stone toast (reusing the FloatingSaveIndicator slot, stacked) "Deleted '{title}' · Undo". Undo restores via the existing `addItem` at the original index (extend `tripEdits.ts` with `insertItemAt(days, dayId, item, index)` + unit test in `__tests__/tripEdits.test.ts`).
- Expansion currently pushes the list down; that's acceptable, but anchor the scroll: after expanding, `scrollIntoView({ block: "nearest" })` on the row.

**7f. Suggestions panel.** Adopt WS1 badge palette. Add a "Select all / none" toggle above the list (bulk action; today unchecking 8 boxes is manual). Group suggestions by day with a mono day header when scope is trip. Confidence renders as text only for `low` ("low confidence" in amber text); medium/high confidence tags are noise: drop them.

**7g. Appearance panel.** The disclosure stays collapsed by default (good). Two changes: accent swatches shrink to `h-8 w-8` (44px tap target via padding) and sit with their names as visible labels; and the panel moves **below** the days column headerinto a quiet "Trip settings" cluster at the bottom of the page together with a relocated status select if 7a's meta-line select proves cramped. Rationale: appearance config is a once-per-trip task and currently occupies the most valuable screen real estate in the editor.

**7h. Performance.** `memo()` `DayCard` and `ItemRow`; `onChange`/`onOpenMap`/`onEnhance` handlers passed to them must be stable (`useCallback` with functional updates: `setDays` already is). With 12 days × ~10 items, typing in one title currently re-renders ~120 rows per keystroke.

**Acceptance criteria**

- Mobile (390px): day chip rail navigates; item rows show two clean lines, no truncation without `title` attr; all tap targets ≥44px.
- Desktop: active day visible in rail while scrolling; editing a title re-renders only that day's card (verify with React DevTools profiler or a render-count probe).
- Item delete → undo restores at the same position (unit test).
- Editor uses zero local button/input class strings (all from `ui.ts`), zero hardcoded amber accents (all `--ta`).
- Verification gate passes; screenshots (editor top, day card, expanded item, suggestions panel, mobile) attached.

---

### WS8 — Accessibility and hardening pass

**Files**: all Trips files; runs after WS3–WS7 merge.

1. **Focus management**: index delete-confirm moves focus to Cancel on open and back to the trigger on close; Escape cancels. Same for the Enhance prompt popover (already has Escape; add focus return).
2. **`aria-pressed` on calendar days** (`DateRangeField.tsx:109`) → `aria-selected` semantics: give the grid `role="grid"`/`row`/`gridcell` or drop the attribute in favor of `aria-label` including "selected" state. Keep the roving arrow-key nav.
3. **Timezone combobox**: add `aria-activedescendant` wiring (options get ids; input points at the active one).
4. **Read-only view**: the editor renders `disabled` inputs for viewers; disabled controls are skipped by screen readers and have weak contrast. Render plain text (with the same layout) when `!editable` instead of disabled inputs.
5. **Touch targets**: audit every interactive element for ≥44px (theme toggle in shared `ThemeToggle` is Korea-owned: if it's <44px, wrap it with padding inside TripsLayout rather than editing the Korea component).
6. **Live regions**: the save pill has `aria-live="polite"` (good); ensure the undo toast and suggestion-apply notices do too (`role="status"`).
7. **i18n/overflow**: verify all titles/addresses handle long hangul strings (`break-words` + `overflow-wrap:anywhere` on user-content spans) using the seeded Korean content.
8. **Error copy**: sweep every `err.message` surface and prefix with a human sentence + action ("Couldn't save your change. It will retry on your next edit. ({message})"). No raw messages standing alone.
9. **Em-dash sweep in UI strings** (not user data): replace with commas/periods per the copy rules.

**Acceptance criteria**: keyboard-only walkthrough of create → edit → delete-undo → enhance-apply completes without traps; axe or equivalent scan shows no new violations; verification gate passes.

---

### WS9 — Motion and microinteraction tuning (small, last)

**Files**: dossier pages + editor.

1. Entry animations on dossier pages: cap total choreography <400ms; current `fadeUp` delays up to 0.26s are fine, do not extend them.
2. Editor: keep `AnimatePresence` add/remove on items; the AI-applied amber flash is good motion-with-purpose: switch its color to `--ta-soft`.
3. Remove `animate-pulse` on the "live" dot (WS6) and any remaining decorative pulses (`rg "animate-pulse" frontend/src/pages/Trips` should only match skeletons).
4. Hover transforms (`group-hover:translate-x-0.5` arrows) stay: they respect `motion-reduce` already.

**Acceptance criteria**: `prefers-reduced-motion` produces zero movement anywhere (spot-check with DevTools emulation); verification gate passes.

---

## 5. Sequencing

```
WS1 (foundation) ──┬─ WS3 (index)
WS2 (bugs)  ───────┼─ WS4 (create)
                   ├─ WS5 (overview) ─ WS6 (day page, needs WS5's anchor contract)
                   └─ WS7 (editor)
WS3..WS7 ──────────── WS8 (a11y/harden) ── WS9 (motion)
```

WS1 and WS2 are prerequisites and must merge first (WS2 can go first; they touch different lines except `TripOverview.tsx`, so coordinate or sequence WS2 → WS1). WS3–WS7 are independent of each other. WS8 and WS9 run over the merged result.

## 6. Global acceptance checklist (definition of done for the whole effort)

- [ ] Every interactive element on every Trips page comes from the `ui.ts` vocabulary; radius, height, and focus treatment are identical across pages.
- [ ] The trip accent chosen in Appearance is visible on overview, day page, AND editor, light and dark.
- [ ] No emoji icons, no badge rainbow, no rounded-full buttons, no `window.alert`/`location.reload`.
- [ ] Seeded trip name renders correctly at every viewport; hero bloom is full-bleed.
- [ ] Mobile editor has day navigation; mobile rows are two-line and tappable.
- [ ] Item delete is undoable; `tripEdits.test.ts` covers the new helper.
- [ ] Nielsen re-score target: ≥30/40 (from 24). Audit re-score target: ≥16/20 (from 13). Re-run the critique after WS8 and record the trend.
- [ ] `bash .codex/check.sh` green; `cd frontend && bun run build && bun run test:run` green.
- [ ] Each PR includes light/dark + desktop/mobile screenshots of changed pages.

## 7. Decisions asserted (defaults chosen so agents don't stall)

- **Keep the dossier serif identity** on read surfaces; the editor goes all-Inter. Not up for re-litigation per anti-slop direction: do not introduce a new font.
- **Booked stays emerald** (semantic success, consistent with the Korea token table), not accent-colored.
- **No drag-and-drop reorder** in this pass: move up/down buttons + move-to-day select remain (drag adds a dependency and a11y surface; revisit later).
- **No modals introduced anywhere**: all confirms/undo stay inline or toast-based.
- **Map Mode entry points keep their current placement** (day page primary button, editor per-day chip); Map Mode internals untouched.
