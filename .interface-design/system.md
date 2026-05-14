# BreathFlow — Interface Design System

> The hub of design decisions for the BreathFlow app. CLAUDE.md holds the brand context and audit; this file holds the *interface-design* commitments — what to build, what to refuse.

## Direction

**Apothecary's notebook, not a wellness app.** Measured, hand-bound, slightly clinical. Closer to a Moleskine pulmonary log than to Calm/Headspace. The interface should feel like a precision instrument for the breath — warm where it touches skin, exact where it touches data.

**Feel words:** quiet, calibrated, deliberate, parchment-warm, ink-exact. Never: glossy, glowing, bouncy, gamified-loud.

**Anti-references:** Calm's gradient-purple wellness aesthetic, Headspace's cartoon illustrations, generic SaaS dashboards with hero-metric grids, glassmorphism, "AI indigo-on-navy."

## Signature

A **thin brass rule (1px, `var(--accent)`) + tabular-mono numeral** wherever data appears. Counts, durations, breaths-per-minute, streak days, XP — all sit on a hairline brass underline with `JetBrains Mono` + `font-variant-numeric: tabular-nums`. This is the through-line. See it once, recognize it everywhere.

The Fluid Orb remains the focal stone of the session experience — untouched.

## Palette (locked to tokens)

Source of truth: `frontend/src/index.css`. No hard-coded hex anywhere in components.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#F5F2ED` | `#171613` | Page background |
| `--surface` | `#FFFEFA` | `hsl(40 6% 11%)` | Cards, panels |
| `--ink-primary` | `#1C1917` | `#E7E3DE` | Body text |
| `--ink-secondary` | `#78716C` | `#A8A29E` | Labels, supporting text |
| `--ink-tertiary` | `#A8A29E` | `#78716C` | Metadata, hints |
| `--ink-muted` | (lighter still) | (darker still) | Disabled, placeholders |
| `--accent` (brass) | `#B8860B` | `#C9A227` | Rules, active marks, primary action |
| `--success` (sage) | `#6B8F71` | `#8DAF92` | Personal bests, completed |
| `--destructive` | `#EF4444` | `#EF4444` | Errors, delete |
| `--border` | `rgba(28,25,23,0.08)` | `rgba(255,252,245,0.06)` | Hairlines |
| `--border-strong` | `rgba(28,25,23,0.14)` | `rgba(255,252,245,0.12)` | Emphasis |

**One accent per viewport.** Brass for the active/primary moment, sage only for "personal best" or "completed today," nothing else colored. Color earns its place.

## Depth Strategy

**Surface color shifts + hairlines. Borders-only depth.** Pick one and commit:

- No shadows in light mode except a single subtle one for popovers/dropdowns (`0 8px 24px -12px rgba(28,25,23,0.18)`).
- Elevation in light = surface stays the same warm cream, border tightens (`--border` → `--border-strong`) for emphasis.
- Elevation in dark = +2–3% lightness on `hsl(40 6% L)`, never a different hue.
- **No glassmorphism.** No backdrop-blur. No glow. No gradient text on headings.
- Dropdowns: one elevation level above parent, with the popover shadow.
- Inputs: slightly *darker* than surroundings (inset feel), hairline border, focus ring uses `--accent` at 40% opacity.

## Spacing

Base unit 4px. Real rhythm, not monotone:

```
4   — icon gap, inline glyph
8   — control internal padding
12  — list row gap
20  — card internal padding
32  — section gap
56  — major separation (between editorial groups)
```

**Padding is symmetrical** unless content demands asymmetry. **Asymmetric layouts** — prefer left-aligned ragged right over centered everything. Center only the orb and the active session.

## Radius

```
0.25rem  — inputs, tight chips
0.5rem   — buttons, cards (default)
0.75rem  — popovers, modals
9999px   — pill chips, the orb
```

Sharp-leaning. We are an instrument, not a toy.

## Typography

Three-voice system: serif display, sans body, mono data.

- **Display** — `Cormorant Garamond`, 500–600 weight, tight tracking (`-0.02em`). Used for h1/h2, hero numerals, technique names. Use sparingly — its job is to make the page feel hand-bound, not decorative.
- **Body / UI** — `Inter`, 400/500/600. All UI chrome, labels, prose, buttons.
- **Data** — `JetBrains Mono` (or system monospace fallback), `font-variant-numeric: tabular-nums`. Every count, duration, BPM, streak, XP value. Always with the brass rule underneath.

Don't rely on size alone — combine size + weight + tracking. Headlines: large, tight, semibold. Body: 15–16px, 400, comfortable. Labels: small, 500, slight letter-spacing.

**No gradient text.** No outline text. No drop-shadow text effects.

## Component Patterns

### `<StatNumeral />` — the signature primitive

**File:** `frontend/src/components/ui/StatNumeral.tsx`

Every quantity in the app — counts, durations, streaks, XP, BPM, hold times — renders through this component. The brass hairline beneath each numeral is the through-line that makes BreathFlow's design recognizable. **Do not render a raw `font-mono tabular-nums` numeral without it.**

```tsx
import { StatNumeral } from '@/components/ui/StatNumeral'

<StatNumeral label="Streak" value={6} unit="days" />
<StatNumeral size="sm" value={3} unit={<>/7</>} />              // inline compound unit
<StatNumeral value={best.maxHoldTime} unit="s" tone="sage" align="end" />
<StatNumeral size="lg" value={formatTime(minutes)} bare />      // bare = no brass rule (rare)
```

**Props**

| prop | default | notes |
|---|---|---|
| `value` | — | The numeral (number or string). Wraps in `font-mono` `tabular-nums` `leading-none`. |
| `label` | — | Optional uppercase Inter 500 caption rendered above (or beside, when `inline`). |
| `unit` | — | Trailing unit — small uppercase, `--ink-tertiary`. |
| `size` | `'md'` | `sm` → text-sm, `md` → text-2xl, `lg` → text-4xl/5xl. |
| `tone` | `'default'` | `default` (ink) · `sage` (personal best / completed today). |
| `align` | `'start'` | `start` left-aligned · `end` right-aligned (use in right-column stat rows). |
| `inline` | `false` | Render label beside the numeral instead of stacked above. |
| `bare` | `false` | Hide the brass rule. Reserve for narrow inline contexts where the rule would clutter. |
| `ariaLabel` | — | Applied to the numeral span — use for pluralized accessible labels (`pluralizeSeconds(30)`). |

**When to use which size**

- `sm` — Stat strips, inline lists, compact mobile chips.
- `md` (default) — Desktop stat strips, editorial stat rows (`SessionStatRow`).
- `lg` — Single hero numeral (e.g., a session-summary headline minute count).

**Tests** — `StatNumeral` renders both numeral and unit as separate spans. In tests, prefer `getByText(/^value$/)` + `getByText(/^unit$/)` over the concatenated string. When the same value appears multiple times on a page (e.g., active days + sessions both = 3), use `getAllByText` and assert count.

### Editorial stat row — `SessionStatRow` pattern (replaces hero-metric grids)

**Reference:** `frontend/src/components/breathing/SessionSummary.tsx` — the local `SessionStatRow` component.

Instead of 2/3/4-up card grids, stats stack as labeled lines:

```
[icon] ROUNDS                          4 ──
[icon] DURATION                     4:32 ──
[icon] XP                            +56 ──
[icon] DOSE                       Light (text, no brass)
```

- Left: optional icon + label (Inter 500, 10px, uppercase, `tracking-[0.07em]`, `--ink-secondary`).
- Right: numeral on brass rule (`font-mono tabular-nums`, `border-b border-bw-accent`, `pb-0.5`). Non-numeric values (a textual "Dose: Light") use plain text — no brass rule.
- Rows separated by `border-t border-bw-border`, `first:border-t-0`. Padding `py-3`.

This pattern is reusable anywhere we have ≥2 stats to surface. Don't reach for grids; reach for rows.

### Editorial numbered list — BadgeGrid pattern (replaces uniform card grids)

**Reference:** `frontend/src/components/gamification/BadgeGrid.tsx`

Lists of comparable items (badges, achievements, techniques) render as a numbered chapter index:

```
01  [icon] First Breath             Complete your first guided session     EARNED
02  [icon] Seven-Day Rhythm         Practice for 7 days in a row           LOCKED
03  [?]    Hidden milestone         Keep practicing — this one reveals…    LOCKED
```

- Two-digit index in `font-display` (Cormorant Garamond) with `tabular-nums`. `text-bw-accent` when earned, `text-bw-tertiary` when locked.
- Icon container: 36px (`h-9 w-9`) square. Filled brass when earned, hairline border when locked.
- Title in `font-display` `text-sm`. Earned = `font-semibold text-bw`, locked = `font-medium text-bw-secondary`.
- Description in `text-[11px] text-bw-tertiary leading-snug`.
- Right column: state pill ("Earned" / "Locked") in `text-[10px] uppercase tracking-[0.07em]`.
- Rows separated by `divide-y divide-bw-border`. Wrap in `<motion.ol role="list">` for semantic + animated stagger.
- Locked entries get `opacity-55` so the brass-earned ones rise.

### Session surface

The session is its own world — `fixed inset-0 z-[60] overflow-hidden`. Orb centered, controls bottom. **Must not scroll at any viewport.** Verified at 320×568, 375×667, 390×844, 1280×800.

Controls are visible at **100% opacity** by default. Idle dim is **color-only**: a `data-dimmed="true"` attribute on the toolbar triggers a `.session-controls-fade` CSS rule that fades child buttons to `var(--bw-text-tertiary)` via `transition-colors`. The destructive stop button preserves `var(--bw-destructive)` even when dimmed. Hover/focus-within instantly restores `var(--bw-text)`. **Never opacity-dim controls** — keyboard focus must remain perceivable.

### Mobile primary-CTA placement (above-the-fold rule)

On viewports < 768px, the *primary action* of any screen must render above the fold at iPhone SE (375×667). Verified placements:

- **Home / Protocol Lab** — "Start recommended session" sits immediately under the protocol header, before the goal pickers and session-window pickers. Pickers live below under a "Tune session" heading. Don't bury the CTA under controls; controls are secondary.
- **Session setup** — `<motion.div data-testid="mobile-session-action-bar">` is pinned (`shrink-0`) at the bottom of the mobile layout. The "Begin" CTA is always visible regardless of scroll position.
- **Active session** — orb is centered (`flex-1 items-center justify-center`); controls are absolute-positioned to the bottom with `env(safe-area-inset-bottom)` padding.

### Sidebar / Nav

Same `--canvas` background as content. Separation is a single hairline `--border` on the right edge. No different color, no fill. Active item: brass rule (2px) on the *left* edge of the item, `--ink-primary` text. Inactive: `--ink-tertiary`. **No backdrop-blur, no glass.** Tokens `--bw-nav-bg`/`--bw-nav-bg-mobile` are fully opaque parchment in light / `hsl(40 6% 11%)` in dark.

### Buttons

- **Primary:** `--ink-primary` background, `--canvas` text. Compact (`padding: 8px 16px`). No gradient, no shadow.
- **Brass:** brass `--accent` background, `--canvas` text. Reserved for "Begin session" and equivalent verbs only.
- **Ghost:** transparent background, `--ink-secondary` text, hairline border on hover.
- **Destructive:** `--destructive` text on `--surface`, hairline border. Filled only at confirm step.

### Inputs

Inset feel: background = `color-mix(in srgb, var(--canvas) 94%, var(--ink-primary) 6%)`. Hairline border. Focus = brass ring + border darken. Minimum touch target 44×44.

## Motion

- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo) for entrances + snappy confirmations, `cubic-bezier(0.33, 0, 0, 1)` (deceleration) for exits + longer transitions. Both are exposed as CSS vars (`--ease-out-expo`, `--ease-decel`).
- **No springs.** `motionPresets.ts` exports `springTransition` but it is now a tween — keep the name for backwards-compat, but no Framer Motion `type:'spring'` anywhere in components.
- **Duration:** 150ms for micro, 240–320ms for confirmations, 600ms max for page-level entrances.
- **No scale pops on hover.** Badges, cards, and stat tiles dim with `opacity: 0.85` on hover instead of `scale: 1.05`. Press feedback (`whileTap`) may use a *small* scale (0.97–0.99) but with a tween, not spring.
- **Orb / breath cycle:** uses GPU transform/opacity only. No `background-position` animations.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` is honored globally (index.css:618). All hooks that read it (`useReducedMotion`) collapse y-offsets and stagger to instant opacity. `useEntranceMotion()` returns reduced-motion variants automatically.

## Accessibility (non-negotiable)

- WCAG AA contrast (4.5:1) on all text.
- Touch targets ≥ 44×44px.
- `prefers-reduced-motion` honored everywhere.
- All breathing components have `aria-live="polite"`, phase changes announced, the orb is a `<button>` with role and label (audit #7).
- `user-scalable=no` removed from viewport meta (audit #4).
- Focus rings visible on every interactive element — never `outline: none` without a replacement.

## What to Refuse

When extending the UI, refuse these defaults — they are the audit's "AI tells":

1. Hero-metric grid (4× big number + small label cards)
2. Identical-size card grids of any kind
3. Glassmorphism (backdrop-blur, semi-transparent surfaces)
4. Gradient text on headings
5. Glow/halo accents
6. Spring/bounce easing (`--spring-bounce`)
7. Centered-everything layouts (orb-and-session screen excepted)
8. More than one accent color per viewport
9. Hard-coded hex in component styles — go through tokens
10. Native `<select>` / native `<input type="date">` — build custom

## Consistency Checks (run before claiming a screen is done)

- **Swap test:** Could another product use this screen with no changes? If yes, the signature isn't doing its job.
- **Squint test:** Blur the screen. Hierarchy still readable? Anything jumping out harshly?
- **Signature test:** Point to 3+ places the brass-rule-numeral signature appears.
- **Token test:** Grep the file for hex/rgb literals. Should be zero in component code.
- **Motion test:** Toggle `prefers-reduced-motion: reduce` in DevTools. Does the screen still work calmly?

---

*Updated: 2026-05-14. Direction confirmed by user.*
