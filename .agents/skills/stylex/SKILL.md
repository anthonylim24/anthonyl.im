---
name: stylex
description: StyleX styling methodology for this repo. Use when writing, reviewing, or migrating frontend UI, CSS, layout, tokens, visual parity, or shadcn/Radix surfaces. Triggers on StyleX, stylex.create, sx(, *.stylex.ts, index.css tokens, cover-band, or Tailwind-to-StyleX parity work.
---

# StyleX (anthonyl.im)

The frontend uses **StyleX 0.19** (`@stylexjs/stylex`, `@stylexjs/unplugin`). Tailwind is **gone** — do not add Tailwind utilities, `@tailwind` directives, or `tailwind.config.*`.

Read this skill before editing UI styling. Design tokens and route personalities still live in [`PRODUCT.md`](../../../PRODUCT.md) and [`DESIGN.md`](../../../DESIGN.md).

## When to apply

- New/changed components under `frontend/src/**`
- Visual parity fixes vs production or vs `main`
- shadcn/ui (`frontend/src/components/ui/*`) or route shells (`breathflow/`, `pages/Korea/`, `pages/Trips/`)
- `index.css` token / animation / semantic-class changes

## Architecture

```
Component  →  {...sx(stylexStyles, 'semantic-class', layout.srOnly)}  →  DOM
                     ↑                           ↑
              *.stylex.ts                  index.css (@layer base / unlayered)
```

| Piece | Location |
|-------|----------|
| Merge helper | `frontend/src/styles/merge.ts` — `sx(...)` merges StyleX props + optional semantic class strings |
| Shared layout primitives | `frontend/src/styles/common.stylex.ts` — `layout.srOnly`, focus rings, etc. |
| Plain CSS-var maps (not StyleX vars) | `frontend/src/styles/tokens.ts` |
| Global tokens + semantic classes | `frontend/src/index.css` |
| Vite plugin + CSS layers | `frontend/vite.config.ts` — `useCSSLayers: { before: ['reset','base'], after: ['utilities'], prefix: 'stylex' }` |
| Route StyleX modules | `*.stylex.ts` next to pages (e.g. `trips.stylex.ts`, `breathflow.stylex.ts`, `Places.stylex.ts`) |

Per-route UI vocabulary:

- Trips: `frontend/src/pages/Trips/ui.ts` exports StyleX class handles (`coverBandClass`, `primaryBtnClass`, …)
- BreathFlow: `frontend/src/breathflow/styles/breathflow.stylex.ts`
- Chatbot: `frontend/src/styles/chatbot.stylex.ts`, `layout.stylex.ts`

## Write styles this way

```tsx
import { sx } from '@/styles/merge'
import { styles } from './trips.stylex'

<header {...sx('cover-band', coverBandClass)}>
  <h1 {...sx(typeDisplayClass, wrapAnywhereClass)}>{title}</h1>
</header>
```

### Critical rules

| Do | Don't |
|----|--------|
| `{...sx(styles.foo, 'semantic-class')}` | Raw `className="tailwind utilities"` |
| Pass semantic classes from `index.css` when the old Tailwind string included them (`cover-band`, `cover-dock`, `snap-rail-sticky`, `trip-display-input`, `group`, `peer`, animation utilities) | Assume StyleX padding/color styles replace semantic classes — **`coverBandClass` is padding only; `'cover-band'` supplies band bg/ink** |
| `layout.srOnly` or `styles.srOnly` for visually hidden labels | Leave labels unstyled (empty StyleX rules render visible text) |
| `borderWidth: '1px'` + `borderStyle: 'solid'` when setting `borderColor` | `borderColor` alone — Preflight sets `border: 0 solid` and invisible borders lose |
| Keep route tokens in `index.css` (`--trips-*`, chatbot/breathflow/korea blocks) | `stylex.defineVars()` for shared tokens or import token maps into `stylex.create()` — Babel rejects cross-file / plain-object token imports |
| Child-combinator layouts as **unlayered or `@layer utilities` classes** in `index.css` | `> * + *` or `:hover` on parent in StyleX when you need sibling spacing |
| `:is(.group:hover) &` in StyleX + `'group'` marker on ancestor | Tailwind `group-hover:*` strings |
| Honor `prefers-reduced-motion` in CSS **and** Motion props | Decorative-only animation |

### CSS layer contract

1. **`@layer reset`** — Preflight equivalent (`frontend/src/index.css`). Must stay layered so StyleX can override `border: 0 solid`.
2. **`@layer base`** — Route token blocks (`.trips`, `.breathflow`, `.chatbot-*`, `.korea`).
3. **StyleX** — `@layer stylex.*` via the Vite plugin.
4. **Unlayered / `@layer utilities`** — Animations (`animate-spin`, `animate-in`, …), Map Mode `.map-*` labels, leaves overlay visibility classes, sibling-divider utilities.

**Unlayered CSS beats layered StyleX** for the same property. If a StyleX opacity/color loses to global CSS, move the rule to an explicit unlayered class (see chatbot leaves overlay: `.leaves-overlay-visible` / `.leaves-overlay-hidden`).

### shadcn/ui

Radix primitives in `frontend/src/components/ui/*` compose StyleX + semantic animation classes from `index.css` (`animate-in`, `fade-in-0`, `zoom-in-95`, …). Do not reintroduce Tailwind `data-[state=open]:animate-in` arbitrary variants.

## Trips-specific

- Cover band: `sx('cover-band', coverBandClass)` on `<header>` in `TripOverview` / `TripCreate`
- Cover dock: `sx('cover-dock', coverDockClass)` — already wired in `CoverDock.tsx`
- Snap rail: `sx('snap-rail-sticky', snapRailStickyClass)` in `DayNavigation.tsx`
- Timetable tokens: `.trips` in `index.css`; accent via `data-trip-accent` on trip shells

## Visual parity / testing

**Clerk-gated Trips routes — local dev (required for agent UI work):**

```bash
# terminal 1 — backend
IG_DEV_BEARER=codex-dev-bearer IG_DEV_USER_ID=codex-dev bun --watch server/app.ts

# terminal 2 — frontend (frontend/.env.local already sets VITE_DEV_BEARER)
cd frontend && bun run dev
```

Verify bypass: `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`

Optional capture script (StyleX branch vs `main` worktree on :5174): `scripts/trips-parity-capture.mjs`

**PR previews:** never bake `VITE_DEV_BEARER`. Use `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` — see [`docs/pr-previews.md`](../../../docs/pr-previews.md) and [`.agents/memory/clerk.md`](../../memory/clerk.md).

## Common parity traps (already hit on this migration)

1. Missing `'cover-band'` → trip hero renders as pale ink on canvas instead of JR cover band
2. Missing `sr-only` on Places search label → extra visible label shifts layout
3. `borderColor` without width/style → chips/checkboxes lose borders after Preflight
4. Map Mode HTML still using Tailwind class strings → use `.map-*` classes in `index.css`
5. Dialog/content using invalid Tailwind animation class names → use semantic classes from `index.css`
6. Unlayered global rule overriding layered StyleX (opacity) → promote to explicit visibility classes

## Do not

- Reinstall Tailwind or `tailwind-merge` for new UI
- `Schema.decode` trip documents while styling (unrelated but often paired — still forbidden)
- Hide Map Mode / WebGL with React `Activity` — must unmount
