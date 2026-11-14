---
name: stylex
description: StyleX styling methodology for this repo. Use when writing, reviewing, or migrating frontend UI, CSS, layout, tokens, visual parity, or shadcn/Radix surfaces. Triggers on StyleX, stylex.create, sx(, *.stylex.ts, index.css tokens, atlas.stylex, or Tailwind-to-StyleX parity work.
---

# StyleX (anthonyl.im)

The frontend uses **StyleX 0.19** (`@stylexjs/stylex`, `@stylexjs/unplugin`). Tailwind is **gone** — do not add Tailwind utilities, `@tailwind` directives, or `tailwind.config.*`.

Read this skill before editing UI styling. What to design is the [`design-craft`](../design-craft/SKILL.md) skill; each route's tokens and personality are in [`PRODUCT.md`](../../../PRODUCT.md) and [`DESIGN.md`](../../../DESIGN.md). This skill is how the styles get written.

## When to apply

- New/changed components under `frontend/src/**`
- Visual parity fixes vs production or vs `main`
- shadcn/ui (`frontend/src/components/ui/*`) or route shells (`chat/`, `breathflow/`, `pages/Landing/`, `pages/Trips/`)
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
| Route StyleX modules | `*.stylex.ts` next to pages (e.g. `atlas.stylex.ts`, `breathflow.stylex.ts`, `landing.stylex.ts`) |

Per-route UI vocabulary:

- Trips: `frontend/src/pages/Trips/atlas.stylex.ts` exports the primitives `a` (`a.display`, `a.eyebrow`, `a.btn` + `a.btnPrimary`, `a.field`, `a.chip`, `a.pill`, `a.menu`, `a.dialog`, …). Page modules: `index.stylex.ts` (`shell`, `idx`, `cover`, `create`), `workspace.stylex.ts` (`share`, `ws`), `map/map.stylex.ts`, `chat.stylex.ts`
- BreathFlow: `frontend/src/breathflow/styles/*.stylex.ts` (+ `watercolor.css`)
- Lim: `frontend/src/styles/chatbot.stylex.ts`, `messageContent.stylex.ts` (tokens in `frontend/src/chat/chat.css`)
- Lab landing: `frontend/src/pages/Landing/landing.stylex.ts`

## Write styles this way

```tsx
import { sx } from '@/styles/merge'
import { a } from './atlas.stylex'
import { ws } from './workspace.stylex'

<header {...sx(ws.head)}>
  <input {...sx(a.fieldBare, a.display, 'trips-title-input')} value={title} />
  <button {...sx(a.btn, a.btnPrimary)}>Share</button>
</header>
```

### Critical rules

| Do | Don't |
|----|--------|
| `{...sx(styles.foo, 'semantic-class')}` | Raw `className="tailwind utilities"` |
| Pass semantic classes from `index.css` when a rule lives there (`trips-title-input`, `trips-day-title-input`, `trip-tap-44`, `group`, `peer`, animation utilities) | Assume StyleX styles replace semantic classes — **a title input without `'trips-title-input'` is pinned to 16px on phones** |
| `layout.srOnly` or `styles.srOnly` for visually hidden labels | Leave labels unstyled (empty StyleX rules render visible text) |
| `borderWidth: '1px'` + `borderStyle: 'solid'` when setting `borderColor` | `borderColor` alone — Preflight sets `border: 0 solid` and invisible borders lose |
| Keep route tokens in CSS (`--trips-*`, `--lim-*`, `--bf-*` in `index.css`; `--chat-*` in `chat/chat.css`) | `stylex.defineVars()` for shared tokens or import token maps into `stylex.create()` — Babel rejects cross-file / plain-object token imports |
| Child-combinator layouts as **unlayered or `@layer utilities` classes** in `index.css` | `> * + *` or `:hover` on parent in StyleX when you need sibling spacing |
| `:is(.group:hover) &` in StyleX + `'group'` marker on ancestor | Tailwind `group-hover:*` strings |
| Honor `prefers-reduced-motion` in CSS **and** Motion props | Decorative-only animation |

### CSS layer contract

1. **`@layer reset`** — Preflight equivalent (`frontend/src/index.css`). Must stay layered so StyleX can override `border: 0 solid`.
2. **`@layer base`** — Route token blocks (`.trips`, `.breathflow`, `.landing`).
3. **StyleX** — `@layer stylex.*` via the Vite plugin.
4. **Unlayered / `@layer utilities`** — Animations (`animate-spin`, `animate-in`, …), `.atlas-pin*` / `.photoreal-pin*` (DOM created outside React), sibling-divider utilities.

**Unlayered CSS beats layered StyleX** for the same property. If a StyleX opacity/color loses to global CSS, move the rule to an explicit unlayered class.

### shadcn/ui

Radix primitives in `frontend/src/components/ui/*` compose StyleX + semantic animation classes from `index.css` (`animate-in`, `fade-in-0`, `zoom-in-95`, …). Do not reintroduce Tailwind `data-[state=open]:animate-in` arbitrary variants.

## Trips-specific

- Compose the primitives in `atlas.stylex.ts` first: `sx(a.btn, a.btnPrimary)`, `sx(a.btn, a.btnGhost, a.btnSm)`, `sx(a.field)`, `sx(a.chip, a.chipAccent)`. Primary buttons are ink.
- Tokens: `.trips` block in `index.css` ("TRIPS — the atlas"). Two accents: `--brand`, `--brand-fill`, `--brand-soft`, `--brand-ring` (constant signal orange) for chrome: focus rings, AI actions, switches, links. `--ta`, `--ta-fill`, `--ta-on`, `--ta-soft`, `--ta-ring` (set by `data-trip-accent` on a trip-scoped subtree) for trip identity only: pins, route, date tiles, status eyebrow, pinned-location row, covers.
- **Focus gotcha:** `.trips :focus-visible { outline: none }` disables the global outline inside Trips. Every new control must draw its own ring with `--brand-ring` (the `a.*` primitives already do; `a.focusable` adds one to a custom element).
- **Portal gotcha:** portaled content leaves the `.trips` subtree and loses `--trips-*` / `--brand-*` / `--ta-*`. Use `Modal` from `components/kit.tsx` (Radix dialog, bottom sheet on phones); it re-declares the token scope with `.trips.trips-portal`. Do not portal raw Radix content.
- Editable trip / day titles take `'trips-title-input'` / `'trips-day-title-input'` to opt out of the 16px phone input pin.
- Map pins are DOM buttons styled by `.atlas-pin*` in `index.css` (created by `map/engine.ts`, outside React), not StyleX.

## Visual parity / testing

**Clerk-gated Trips routes — local dev (required for agent UI work):**

```bash
# terminal 1 — backend
IG_DEV_BEARER=codex-dev-bearer IG_DEV_USER_ID=codex-dev bun --watch server/app.ts

# terminal 2 — frontend (frontend/.env.local already sets VITE_DEV_BEARER)
cd frontend && bun run dev
```

Verify bypass: `cd frontend && bun run e2e -- e2e/smoke.spec.ts -g "trips skips"`

Screenshots (desktop + phone, light + dark): `cd frontend && node scripts/capture-trips.mjs <out-dir> [tripSlug]`. `CAPTURE_ONLY=desktop-light,phone-light` limits the set; `PLAYWRIGHT_BASE_URL` overrides `http://localhost:5173`.

**PR previews:** never bake `VITE_DEV_BEARER`. Use `bun scripts/clerk-agent-login.ts --pr <n> --path /trips/korea-2026` — see [`docs/pr-previews.md`](../../../docs/pr-previews.md) and [`.agents/memory/clerk.md`](../../memory/clerk.md).

## Common parity traps (already hit on this migration)

1. Trips control with no focus ring → the global outline is off inside `.trips`; add a `--brand-ring` ring
2. A visually hidden label without `layout.srOnly` → extra visible text shifts layout
3. `borderColor` without width/style → chips/checkboxes lose borders after Preflight
4. DOM built outside React (map pins) styled with ad-hoc class strings → use the semantic classes in `index.css`
5. Dialog/content using invalid Tailwind animation class names → use semantic classes from `index.css`
6. Unlayered global rule overriding layered StyleX (opacity) → promote to explicit visibility classes

## Do not

- Reinstall Tailwind or `tailwind-merge` for new UI
- `Schema.decode` trip documents while styling (unrelated but often paired — still forbidden)
- Hide the photoreal 3D view / WebGL with React `Activity` — must unmount
