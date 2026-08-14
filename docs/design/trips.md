# Trips — interface design commitments

> The design authority for `/trips/*` is the vendored Taste Skills V2 pair
> (`.claude/skills/design-taste-frontend/SKILL.md` and
> `.claude/skills/redesign-existing-projects/SKILL.md`). This file records the
> decisions that skill produced for this app, so the next agent does not have to
> re-derive them. Where this file and the older prose in `CLAUDE.md` /
> `PRODUCT.md` disagree about Trips, this file wins.

## Design read

> A private multi-trip planning product for a couple of collaborators planning
> and then executing travel, with a cool precise editorial language, leaning
> toward Tailwind v4 tokens, self-hosted Bricolage Grotesque display, and one
> accent per trip.

Dials: `DESIGN_VARIANCE 6`, `MOTION_INTENSITY 5`, `VISUAL_DENSITY 5` (editor 6).

The editor at `/trips/:tripId/edit` is dense product UI, which the skill
explicitly says it does not own (section 13). The marketing-page rules (hero
discipline, eyebrow rationing, imagery, copy audit) apply to the entry and
reading surfaces; the editor gets the product rules only: complete interactive
state cycles, contrast, 44px targets, motivated motion, and the shape and
colour locks.

## What was retired, and why

| Retired | Rule |
|---|---|
| `01` / `02` numerals opening each section | 9.F, section-number eyebrows |
| A mono uppercase eyebrow above nearly every heading | 4.7, at most `ceil(sections / 3)` |
| `·` as the default separator, three or four to a line | 9.F, one per line |
| `–` in date ranges, `→` in hero meta | 9.G, en and em dashes banned outright |
| Cormorant Garamond as the display face | 4.1, serif is not the default for a product |
| Warm parchment canvas, brass accent, espresso ink | 4.2, the banned premium-consumer palette family |
| Accent dots on countdowns, statuses, and list rows | 9.F, zero decorative dots |
| Three consecutive `divide-y` row lists | 4.7, layout-family repetition |
| Pill status badges | redesign skill, the pill badge cliche |
| Zero imagery on any surface | 4.8, real images required |

## Tokens

Declared in the `.trips` block of `frontend/src/index.css`. Components never
hard-code colour; they read tokens through arbitrary Tailwind values
(`text-[color:var(--tr-ink)]`), which is why almost nothing in this app carries
a `dark:` variant.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--tr-canvas` | `#eff1f3` | `#0d1013` | Page |
| `--tr-surface` | `#fafbfc` | `#14181c` | Panels |
| `--tr-raised` | `#fdfeff` | `#1a1f25` | Inputs, popovers |
| `--tr-ink` | `#111418` | `#e6e9ec` | Body |
| `--tr-ink-muted` | `#4c5966` | `#a2aeba` | Secondary copy (AA floor) |
| `--tr-ink-faint` | `#66727f` | `#8794a1` | Large type and marks only |
| `--tr-line` / `--tr-line-strong` | 10% / 20% ink | 10% / 20% ink | Hairlines, field borders |
| `--tr-ok` / `--tr-warn` / `--tr-danger` | `#0f6b4f` / `#8a5300` / `#b42318` | `#5fd3a8` / `#e2ac5a` / `#ff9d95` | Semantic badges only |

Accent: five keys (`rose amber emerald sky violet`, server-validated, so the
keys cannot change) re-solved in OKLCH against the cool canvas. `data-trip-accent`
on a trip subtree swaps `--ta`, `--ta-strong`, `--ta-soft`, `--ta-ring`,
`--ta-ink`, and the two bloom stops. Outside a trip, chrome uses the ember
default. Every accent clears 4.5:1 against canvas, surface, and its own soft
tint in both themes; `--ta-ink` is the label colour solved for the filled
button. The audit script that proves this lives in the PR that introduced the
redesign.

**One accent per page.** The semantic trio above is allowed as small badges and
nowhere else.

## Shape, type, motion

- Radius: panels and cards `--tr-r-panel` (12px), controls and chips
  `--tr-r-control` (8px), `rounded-full` only for the floating save pill, toggle
  thumbs, and genuine status dots.
- Type: display is Bricolage Grotesque Variable through `.font-display` plus the
  `DISPLAY` style constant; body is Geist Variable from the shell; numbers,
  times, and counts are Geist Mono Variable through `.font-mono-trips`, tabular.
  Sizes come from `displayTitleClass`, `displaySectionClass`, `displayCardClass`.
- Motion: `REVEAL_DURATION` 220ms with `revealDelay` capped at six steps,
  `ENTER_SPRING` for surfaces that arrive on top of the page, `EXIT_FADE` for
  anything focusable that leaves. Everything degrades under
  `prefers-reduced-motion`. An animation that cannot be justified in one
  sentence does not ship.

## Layout families (one use each)

| Surface | Family |
|---|---|
| Index, current and upcoming | Editorial rows with a mono mark column |
| Index, past | Quiet card grid |
| Create | Asymmetric two-path split, then a single-column form |
| Trip overview | Split hero with the contour plate, then a day card grid with a full-width lead cell |
| Trip overview, reservations | Cards grouped by day |
| Day page | Timeline with a time gutter |
| Editor | Two-pane: sticky day rail plus editing canvas |

## Imagery

- `/media/trip-contour.webp` (119 KB): a generated contour scan, blended and
  tinted by the accent behind `.trip-plate`. One asset serves all five accents.
- `/media/trip-start.webp` (48 KB): the desk photograph used by the empty state,
  the create page, and the signed-out gate.

Decorative plates are `aria-hidden`; content images carry real alt text. No
remote placeholder services ship.

## Rules a future change must not break

1. Routes, slugs, anchor ids (`#item-<id>`), and the `TripAccent` keys are
   contracts. Redesign around them.
2. Autosave, the undo window, permission gating, enhancement apply semantics,
   and the `placesUrl` Map Mode contract are behaviour, not decoration.
3. Colour, radius, and motion come from `pages/Trips/ui.ts`. A page that needs a
   new value adds it there with a comment, or it does not need it.
4. Secondary copy uses `mutedInkClass`. `faintInkClass` never carries a sentence.
5. Every interactive element: 44x44 minimum, visible focus ring, `:active`
   feedback, accessible name.
