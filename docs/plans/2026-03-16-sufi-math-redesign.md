# Sufi-Mathematical Theme Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current zinc/indigo theme with a monochromatic, Sufi-mathematical aesthetic inspired by Second Nature — warm parchment canvas, Cormorant Garamond + Inter typography, concentric ring geometry replacing the fluid orb, and technique differentiation through geometry instead of color.

**Architecture:** Foundation-up approach: tokens/fonts first, then surface system, then component-by-component migration. The breathing orb is replaced with a new `ConcentricRings` component using SVG. All technique colors are removed — replaced by geometric motifs (square grid, triangle, octagram, spiral). Light theme is primary; dark is a warm inversion.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4.2, Motion (framer-motion), SVG for geometric elements, Google Fonts (Cormorant Garamond + Inter)

---

### Task 1: Update fonts in index.html and tailwind.config.js

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/tailwind.config.js`

**Step 1: Replace Google Fonts link**

In `frontend/index.html`, replace the DM Sans + Anybody font link with Cormorant Garamond (300,400,500,600,700) + Inter (400,500,600):

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

Also update the anti-FOUC background color from `#030014` to `#F5F2ED` (parchment).

**Step 2: Update tailwind.config.js font families**

Replace the font families:
```js
fontFamily: {
  sans: ['"Inter"', 'system-ui', ...fontFamily.sans],
  display: ['"Cormorant Garamond"', 'Georgia', ...fontFamily.serif],
},
```

**Step 3: Update root font-family in index.css**

In `frontend/src/index.css` line 26, change the root font-family:
```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

**Step 4: Verify fonts load**

Run: `cd frontend && bun run dev`
Open browser, inspect elements — headings should use Cormorant Garamond, body text should use Inter.

**Step 5: Commit**
```bash
git add frontend/index.html frontend/tailwind.config.js frontend/src/index.css
git commit -m "feat: replace DM Sans/Anybody with Cormorant Garamond/Inter typography"
```

---

### Task 2: Rewrite CSS token system for parchment + ink palette

**Files:**
- Modify: `frontend/src/index.css` (lines 25-55 root tokens, lines 268-382 tailwind base layer, lines 258-262 selection/focus)

**Step 1: Replace root-level tokens**

Replace lines 25-55 with the new token system:

```css
:root {
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  font-optical-sizing: auto;

  /* Portfolio tokens (unchanged) */
  --portfolio-bg: #0a0a12;
  --portfolio-glass-tint: rgba(120, 130, 255, 0.08);
  --portfolio-glass-border: rgba(255, 255, 255, 0.12);
  --portfolio-accent-1: #7c8aff;
  --portfolio-accent-2: #a78bfa;
  --portfolio-text: #f8f7ff;
  --portfolio-text-muted: rgba(248, 247, 255, 0.6);

  /* Breathwork tokens — parchment + ink */
  --breath-canvas: #F5F2ED;
  --breath-ink: #1C1917;
  --breath-ink-secondary: #78716C;
  --breath-ink-tertiary: #A8A29E;
  --breath-surface: #FFFEFA;
  --breath-well: rgba(28, 25, 23, 0.03);
  --breath-border: rgba(28, 25, 23, 0.08);
  --breath-border-hover: rgba(28, 25, 23, 0.14);

  /* Easing — slow deceleration, no bounce */
  --ease-decel: cubic-bezier(0.33, 0, 0, 1);
  --spring-smooth: cubic-bezier(0.33, 0, 0, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Step 2: Rewrite .breathwork light tokens**

Replace the `.breathwork` block (lines 292-334) with parchment-based tokens:

```css
.breathwork {
  color-scheme: light;
  --background: 36 33% 95%;
  --foreground: 20 13% 9%;
  --card: 43 100% 99%;
  --card-foreground: 20 13% 9%;
  --popover: 43 100% 99%;
  --popover-foreground: 20 13% 9%;
  --primary: 20 13% 9%;
  --primary-foreground: 36 33% 95%;
  --secondary: 30 10% 94%;
  --secondary-foreground: 20 13% 9%;
  --muted: 30 10% 94%;
  --muted-foreground: 25 5% 45%;
  --accent: 30 10% 94%;
  --accent-foreground: 20 13% 9%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 25 8% 88%;
  --input: 25 8% 88%;
  --ring: 20 13% 9% / 0.2;
  --radius: 0.5rem;

  /* Semantic bw tokens (light — parchment) */
  --bw-text: #1C1917;
  --bw-text-secondary: #78716C;
  --bw-text-tertiary: #A8A29E;
  --bw-text-faint: #D6D3D1;
  --bw-border: rgba(28, 25, 23, 0.08);
  --bw-border-subtle: rgba(28, 25, 23, 0.04);
  --bw-hover: rgba(28, 25, 23, 0.04);
  --bw-active: rgba(28, 25, 23, 0.08);
  --bw-nav-bg: rgba(245, 242, 237, 0.92);
  --bw-nav-bg-mobile: rgba(245, 242, 237, 0.95);
  --bw-nav-border: rgba(28, 25, 23, 0.06);
  --bw-nav-shadow: none;
  --bw-chart-grid: rgba(28, 25, 23, 0.06);
  --bw-chart-tick: rgba(28, 25, 23, 0.35);
  --bw-tooltip-bg: rgba(255, 254, 250, 0.97);
  --bw-tooltip-border: rgba(28, 25, 23, 0.08);
  --bw-tooltip-label: rgba(28, 25, 23, 0.85);
  --bw-tooltip-item: rgba(28, 25, 23, 0.55);
}
```

**Step 3: Rewrite .dark .breathwork tokens**

Replace the `.dark .breathwork` block (lines 337-378) with warm dark inversion:

```css
.dark .breathwork {
  color-scheme: dark;
  --background: 40 8% 8%;
  --foreground: 36 15% 90%;
  --card: 40 6% 11%;
  --card-foreground: 36 15% 90%;
  --popover: 40 6% 11%;
  --popover-foreground: 36 15% 90%;
  --primary: 36 15% 90%;
  --primary-foreground: 40 8% 8%;
  --secondary: 30 5% 15%;
  --secondary-foreground: 36 15% 90%;
  --muted: 30 5% 15%;
  --muted-foreground: 30 5% 55%;
  --accent: 30 5% 15%;
  --accent-foreground: 36 15% 90%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 36 15% 90%;
  --border: 30 5% 18%;
  --input: 30 5% 18%;
  --ring: 36 15% 90% / 0.2;

  /* Semantic bw tokens (dark — manuscript at night) */
  --bw-text: #E7E3DE;
  --bw-text-secondary: #8C857E;
  --bw-text-tertiary: rgba(231, 227, 222, 0.35);
  --bw-text-faint: rgba(231, 227, 222, 0.18);
  --bw-border: rgba(255, 252, 245, 0.06);
  --bw-border-subtle: rgba(255, 252, 245, 0.03);
  --bw-hover: rgba(255, 252, 245, 0.04);
  --bw-active: rgba(255, 252, 245, 0.08);
  --bw-nav-bg: rgba(23, 22, 19, 0.92);
  --bw-nav-bg-mobile: rgba(23, 22, 19, 0.95);
  --bw-nav-border: rgba(255, 252, 245, 0.06);
  --bw-nav-shadow: none;
  --bw-chart-grid: rgba(255, 252, 245, 0.06);
  --bw-chart-tick: rgba(255, 252, 245, 0.35);
  --bw-tooltip-bg: rgba(23, 22, 19, 0.97);
  --bw-tooltip-border: rgba(255, 252, 245, 0.08);
  --bw-tooltip-label: rgba(255, 252, 245, 0.85);
  --bw-tooltip-item: rgba(255, 252, 245, 0.55);
}
```

**Step 4: Update selection and focus styles**

Replace lines 258-262:
```css
::selection { background: rgba(28, 25, 23, 0.12); color: #1C1917; }
.breathwork ::selection { background: rgba(28, 25, 23, 0.12); color: #1C1917; }
.dark .breathwork ::selection { background: rgba(231, 227, 222, 0.2); color: #E7E3DE; }
:focus-visible { outline: 2px solid rgba(28, 25, 23, 0.3); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
```

**Step 5: Commit**
```bash
git add frontend/src/index.css
git commit -m "feat: rewrite CSS tokens for parchment+ink monochromatic palette"
```

---

### Task 3: Rewrite surface system and backgrounds

**Files:**
- Modify: `frontend/src/index.css` (lines 386-582 — surface system, backgrounds)

**Step 1: Replace entire surface system**

Replace the card system and surface system blocks (lines 386-582) with flat paper surfaces:

```css
/* ═══════════════════════════════════════════════════════
   SURFACE SYSTEM — Flat paper, no glass
   ═══════════════════════════════════════════════════════ */

/* Selective grain texture — cards and panels only */
.grain-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  pointer-events: none;
  border-radius: inherit;
  z-index: 1;
  opacity: 0.5;
  mix-blend-mode: multiply;
}

.dark .grain-surface::after {
  mix-blend-mode: overlay;
  opacity: 0.3;
}

/* Portfolio glass (portfolio only — keep as-is) */
.liquid-glass-portfolio {
  background: linear-gradient(135deg, rgba(120,130,255,0.18) 0%, rgba(167,139,250,0.14) 50%, rgba(120,130,255,0.10) 100%);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
}

/* Recessed well — inputs, progress bars */
.surface-well {
  background: rgba(28, 25, 23, 0.03);
  border: 1px solid rgba(28, 25, 23, 0.04);
}

/* Standard card — paper on paper */
.card-elevated {
  position: relative;
  background: #FFFEFA;
  border: 1px solid rgba(28, 25, 23, 0.08);
  transition: border-color 0.3s var(--ease-decel);
}
.card-elevated:hover {
  border-color: rgba(28, 25, 23, 0.14);
}

/* Prominent card — same as standard, no distinction needed */
.sculpted-card {
  position: relative;
  background: #FFFEFA;
  border: 1px solid rgba(28, 25, 23, 0.08);
  transition: border-color 0.3s var(--ease-decel);
}
.sculpted-card:hover {
  border-color: rgba(28, 25, 23, 0.14);
}

/* Generic glass compat (shadcn Card) */
.glass {
  background: #FFFEFA;
  border: 1px solid rgba(28, 25, 23, 0.08);
}
.glass:hover {
  border-color: rgba(28, 25, 23, 0.14);
}

/* Breathwork base background */
.breathwork {
  background-color: #F5F2ED;
}
.dark .breathwork {
  background-color: #171613;
}

/* Dark breathwork surfaces */
.dark .breathwork .surface-well {
  background: rgba(255, 252, 245, 0.03);
  border: 1px solid rgba(255, 252, 245, 0.03);
}
.dark .breathwork .card-elevated {
  background: rgba(255, 252, 245, 0.04);
  border: 1px solid rgba(255, 252, 245, 0.06);
}
.dark .breathwork .card-elevated:hover {
  border-color: rgba(255, 252, 245, 0.10);
}
.dark .breathwork .sculpted-card {
  background: rgba(255, 252, 245, 0.04);
  border: 1px solid rgba(255, 252, 245, 0.06);
}
.dark .breathwork .sculpted-card:hover {
  border-color: rgba(255, 252, 245, 0.10);
}
.dark .breathwork .glass {
  background: rgba(255, 252, 245, 0.04);
  border: 1px solid rgba(255, 252, 245, 0.06);
}
.dark .breathwork .glass:hover {
  border-color: rgba(255, 252, 245, 0.10);
}

/* Clean canvas */
.breath-bg {
  background: #F5F2ED;
}
.dark .breath-bg {
  background: #171613;
}

/* Portfolio glass compat (unchanged) */
.glass-strong {
  background: rgba(255,255,255,0.45);
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border: 1px solid rgba(255,255,255,0.4);
}
.dark .glass-strong {
  background: rgba(20,25,40,0.7);
  border: 1px solid rgba(255,255,255,0.1);
}
```

Remove the `.card-gradient-indigo` class and its `::before` pseudo-element (lines 446-542) — no longer needed.

Remove the `.gradient-text` class (lines 545-548) — portfolio only, can keep if needed.

Remove `.breath-orb-*` classes (lines 564-570) — no longer needed.

Remove the `.noise-overlay::after` block (lines 388-402) — replaced by `.grain-surface`.

**Step 2: Update scrollbar colors**

Replace lines 91-99:
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(28, 25, 23, 0.10); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(28, 25, 23, 0.18); }

.dark ::-webkit-scrollbar-thumb { background: rgba(255, 252, 245, 0.08); }
.dark ::-webkit-scrollbar-thumb:hover { background: rgba(255, 252, 245, 0.15); }
```

**Step 3: Commit**
```bash
git add frontend/src/index.css
git commit -m "feat: flat paper surface system, remove glassmorphism and gradient cards"
```

---

### Task 4: Rewrite palette.ts — monochromatic, no technique colors

**Files:**
- Modify: `frontend/src/lib/palette.ts`

**Step 1: Rewrite palette.ts**

Replace the entire file with a monochromatic system. Technique colors are replaced with geometry identifiers. Phase colors become shades of warm grey/ink:

```typescript
// palette.ts – Monochromatic parchment + ink color system.
// No technique colors — differentiation is through geometry, not color.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS, BREATH_PHASES, type BreathPhase } from './constants'

// ── Canvas ──────────────────────────────────────────────────────────────
export const CANVAS = '#F5F2ED'
export const CANVAS_DARK = '#171613'
export const SURFACE = '#FFFEFA'

// ── Ink ─────────────────────────────────────────────────────────────────
export const INK = '#1C1917'
export const INK_SECONDARY = '#78716C'
export const INK_TERTIARY = '#A8A29E'
export const INK_FAINT = '#D6D3D1'

// Legacy aliases (for components not yet migrated)
export const BG = CANVAS_DARK  // breathing session still uses dark bg
export const BG_ELEVATED = '#1F1E1A'
export const TEXT = INK
export const TEXT_MUTED = INK_SECONDARY
export const ACCENT = INK          // primary interactive = ink color
export const ACCENT_BRIGHT = '#292524'  // stone-800
export const ACCENT_SUBTLE = '#0C0A09'  // stone-950

// ── Breath-phase colors (monochromatic ink shades for the ring system) ──
export const PHASE = {
  inhale:      '#1C1917',   // full ink
  deep_inhale: '#292524',   // stone-800
  hold_in:     '#44403C',   // stone-700
  exhale:      '#57534E',   // stone-600
  hold_out:    '#78716C',   // stone-500
  rest:        '#A8A29E',   // stone-400
} as const

// ── Per-technique phase colors (monochromatic — same for all) ───────────
const MONO_PHASES: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]:      '#1C1917',
  [BREATH_PHASES.DEEP_INHALE]: '#292524',
  [BREATH_PHASES.HOLD_IN]:     '#44403C',
  [BREATH_PHASES.EXHALE]:      '#57534E',
  [BREATH_PHASES.HOLD_OUT]:    '#78716C',
  [BREATH_PHASES.REST]:        '#A8A29E',
}

export const TECHNIQUE_PHASES: Record<TechniqueId, Record<BreathPhase, string>> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   MONO_PHASES,
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   MONO_PHASES,
  [TECHNIQUE_IDS.POWER_BREATHING]: MONO_PHASES,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  MONO_PHASES,
}

// ── Technique visual config (no color — geometry only) ──────────────────
export const TECHNIQUE = {
  box:     { primary: INK, secondary: INK_SECONDARY },
  co2:     { primary: INK, secondary: INK_SECONDARY },
  power:   { primary: INK, secondary: INK_SECONDARY },
  sighing: { primary: INK, secondary: INK_SECONDARY },
} as const

export const TECHNIQUE_GRADIENT = {
  box:     { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  co2:     { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  power:   { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
  sighing: { from: INK, via: INK_SECONDARY, to: INK_TERTIARY },
} as const

// ── Achievement / gamification ──────────────────────────────────────────
export const ACHIEVEMENT = INK
export const PERSONAL_BEST = INK_SECONDARY

// ── Destructive ─────────────────────────────────────────────────────────
export const DESTRUCTIVE = '#EF4444'

// ── Heatmap intensity stops (ink ramp) ──────────────────────────────────
export const HEATMAP = [
  'rgba(28, 25, 23, 0.06)',
  'rgba(28, 25, 23, 0.14)',
  'rgba(28, 25, 23, 0.28)',
  'rgba(28, 25, 23, 0.50)',
] as const

// ── FluidOrb phase color pairs (ink shades) ─────────────────────────────
export const PHASE_PAIR: Record<string, [string, string]> = {
  inhale:      [PHASE.inhale, PHASE.exhale],
  deep_inhale: [PHASE.deep_inhale, PHASE.inhale],
  hold_in:     [PHASE.hold_in, PHASE.inhale],
  exhale:      [PHASE.exhale, PHASE.hold_out],
  hold_out:    [PHASE.hold_out, PHASE.rest],
  rest:        [PHASE.rest, INK_FAINT],
  idle:        [INK_FAINT, PHASE.rest],
}

// ── Badge gradient ──────────────────────────────────────────────────────
export const BADGE_GRADIENT = { from: INK, to: INK_SECONDARY } as const

// ── Utilities ───────────────────────────────────────────────────────────
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
```

**Step 2: Commit**
```bash
git add frontend/src/lib/palette.ts
git commit -m "feat: monochromatic parchment+ink palette, remove all technique colors"
```

---

### Task 5: Update techniqueConfig.ts — geometry identifiers, no color gradients

**Files:**
- Modify: `frontend/src/lib/techniqueConfig.ts`

**Step 1: Rewrite techniqueConfig.ts**

Replace technique card gradients with flat ink styling. Add geometry type identifiers for each technique:

```typescript
// techniqueConfig.ts – Technique visual configuration.
// Monochromatic: techniques are distinguished by geometry, not color.

import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { TECHNIQUE, TECHNIQUE_GRADIENT, TECHNIQUE_PHASES, INK, INK_SECONDARY } from './palette'

export type TechniqueGeometry = 'grid' | 'triangle' | 'octagram' | 'spiral'

export interface TechniqueVisual {
  primary: string
  secondary: string
  gradient: { from: string; via: string; to: string }
  geometry: TechniqueGeometry
}

const VISUALS: Record<TechniqueId, TechniqueVisual> = {
  [TECHNIQUE_IDS.BOX_BREATHING]:   { ...TECHNIQUE.box, gradient: TECHNIQUE_GRADIENT.box, geometry: 'grid' },
  [TECHNIQUE_IDS.CO2_TOLERANCE]:   { ...TECHNIQUE.co2, gradient: TECHNIQUE_GRADIENT.co2, geometry: 'triangle' },
  [TECHNIQUE_IDS.POWER_BREATHING]: { ...TECHNIQUE.power, gradient: TECHNIQUE_GRADIENT.power, geometry: 'octagram' },
  [TECHNIQUE_IDS.CYCLIC_SIGHING]:  { ...TECHNIQUE.sighing, gradient: TECHNIQUE_GRADIENT.sighing, geometry: 'spiral' },
}

export function getTechniqueVisual(id: TechniqueId): TechniqueVisual {
  return VISUALS[id]
}

export function getTechniqueGeometry(id: TechniqueId): TechniqueGeometry {
  return VISUALS[id].geometry
}

/** Inline style for technique icon box — flat ink */
export function techniqueGradientStyle(_id: TechniqueId): React.CSSProperties {
  return {
    background: INK,
  }
}

/** Inline style for an active/selected state — subtle ink tint */
export function techniqueActiveStyle(_id: TechniqueId): React.CSSProperties {
  return {
    borderColor: 'rgba(28, 25, 23, 0.14)',
    background: 'rgba(28, 25, 23, 0.04)',
  }
}

/** Technique card background — flat ink */
export function techniqueCardGradient(_id: TechniqueId): React.CSSProperties {
  return {
    background: INK,
    border: '1px solid rgba(28, 25, 23, 0.08)',
  }
}

/** Progress bar style — ink */
export function techniqueProgressStyle(_id: TechniqueId): React.CSSProperties {
  return {
    background: INK,
  }
}

/** Default accent style */
export function accentGradientStyle(): React.CSSProperties {
  return {
    background: INK,
  }
}

/** Per-technique phase color map */
export function getTechniquePhaseColors(id: TechniqueId) {
  return TECHNIQUE_PHASES[id]
}
```

**Step 2: Commit**
```bash
git add frontend/src/lib/techniqueConfig.ts
git commit -m "feat: add geometry identifiers to techniques, flatten all gradients to ink"
```

---

### Task 6: Create ConcentricRings SVG component

**Files:**
- Create: `frontend/src/components/breathing/ConcentricRings.tsx`

**Step 1: Create the component**

This replaces FluidOrb as the breathing visualization. SVG-based concentric rings that expand/contract with breath phases, with technique-specific geometric overlays.

```typescript
import { useMemo } from 'react'
import { type BreathPhase, BREATH_PHASES } from '@/lib/constants'
import type { TechniqueId } from '@/lib/constants'
import { getTechniqueGeometry, type TechniqueGeometry } from '@/lib/techniqueConfig'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'

interface ConcentricRingsProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  techniqueId: TechniqueId
  className?: string
}

const RING_COUNT = 8
const BASE_RADIUS = 20
const RING_SPACING = 10

// Expanding phases push rings outward, contracting phases pull inward
function isExpandingPhase(phase: BreathPhase | null): boolean {
  if (!phase) return false
  return phase === BREATH_PHASES.INHALE || phase === BREATH_PHASES.DEEP_INHALE
}

function isHoldPhase(phase: BreathPhase | null): boolean {
  if (!phase) return false
  return phase === BREATH_PHASES.HOLD_IN || phase === BREATH_PHASES.HOLD_OUT
}

/** Technique geometry overlay SVG elements */
function GeometryOverlay({ geometry, size, opacity }: { geometry: TechniqueGeometry; size: number; opacity: number }) {
  const center = size / 2
  const style = { opacity, transition: 'opacity 0.6s ease' }

  switch (geometry) {
    case 'grid': {
      // 4x4 grid lines inscribed within the rings
      const gridSize = size * 0.55
      const halfGrid = gridSize / 2
      const lines = []
      for (let i = 0; i <= 4; i++) {
        const pos = (i / 4) * gridSize - halfGrid
        lines.push(
          <line key={`h${i}`} x1={center - halfGrid} y1={center + pos} x2={center + halfGrid} y2={center + pos} />,
          <line key={`v${i}`} x1={center + pos} y1={center - halfGrid} x2={center + pos} y2={center + halfGrid} />
        )
      }
      return <g stroke="currentColor" strokeWidth="0.5" style={style}>{lines}</g>
    }
    case 'triangle': {
      // Equilateral triangle inscribed in rings
      const r = size * 0.32
      const points = [0, 1, 2].map(i => {
        const angle = (i * 2 * Math.PI / 3) - Math.PI / 2
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={points} fill="none" stroke="currentColor" strokeWidth="0.5" style={style} />
    }
    case 'octagram': {
      // 8-pointed star (two overlapping squares rotated 45deg)
      const r = size * 0.32
      const square1 = [0, 1, 2, 3].map(i => {
        const angle = (i * Math.PI / 2) - Math.PI / 4
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
      }).join(' ')
      const square2 = [0, 1, 2, 3].map(i => {
        const angle = (i * Math.PI / 2)
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
      }).join(' ')
      return (
        <g fill="none" stroke="currentColor" strokeWidth="0.5" style={style}>
          <polygon points={square1} />
          <polygon points={square2} />
        </g>
      )
    }
    case 'spiral': {
      // Golden spiral approximation
      const points: string[] = []
      const turns = 3
      const maxR = size * 0.35
      for (let i = 0; i <= turns * 60; i++) {
        const t = i / 60
        const angle = t * 2 * Math.PI
        const r = (t / turns) * maxR
        points.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`)
      }
      return (
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          style={style}
        />
      )
    }
  }
}

export function ConcentricRings({ phase, amplitude, isActive, techniqueId, className }: ConcentricRingsProps) {
  const reducedMotion = useReducedMotion()
  const geometry = getTechniqueGeometry(techniqueId)

  const expanding = isExpandingPhase(phase)
  const holding = isHoldPhase(phase)

  // Scale factor: rings expand on inhale, contract on exhale
  const scale = reducedMotion ? 1 : (expanding ? 0.85 + amplitude * 0.15 : 1.0 - amplitude * 0.15)

  // Line opacity: thins on expand, thickens on contract
  const lineOpacity = holding
    ? 0.12 + Math.sin(Date.now() / 1500) * 0.03 // subtle pulse on hold
    : expanding
      ? 0.15 - amplitude * 0.05
      : 0.08 + amplitude * 0.07

  // Geometry rotation — 1 revolution per 60s
  const rotation = reducedMotion ? 0 : undefined // handled by CSS animation

  const viewBoxSize = 200
  const transitionDuration = isActive ? '800ms' : '1200ms'

  const rings = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => {
      const r = BASE_RADIUS + i * RING_SPACING
      return <circle key={i} cx={viewBoxSize / 2} cy={viewBoxSize / 2} r={r} fill="none" stroke="currentColor" strokeWidth="0.75" />
    })
  }, [])

  return (
    <div
      className={cn('relative flex items-center justify-center text-bw', className)}
      role="img"
      aria-label={`Breathing visualization — ${phase ? phase.replace('_', ' ') : 'idle'}`}
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transition: reducedMotion ? 'none' : `transform ${transitionDuration} ease-out`,
        }}
      >
        {/* Crosshair axes */}
        <line x1={viewBoxSize / 2} y1="0" x2={viewBoxSize / 2} y2={viewBoxSize} stroke="currentColor" strokeWidth="0.3" opacity={lineOpacity * 0.6} />
        <line x1="0" y1={viewBoxSize / 2} x2={viewBoxSize} y2={viewBoxSize / 2} stroke="currentColor" strokeWidth="0.3" opacity={lineOpacity * 0.6} />

        {/* Concentric rings */}
        <g
          opacity={lineOpacity}
          style={{
            transition: reducedMotion ? 'none' : `opacity ${transitionDuration} ease-out`,
          }}
        >
          {rings}
        </g>

        {/* Technique geometry overlay — slow rotation */}
        <g
          style={{
            transformOrigin: '50% 50%',
            animation: reducedMotion ? 'none' : 'spin-slow 60s linear infinite',
          }}
        >
          <GeometryOverlay geometry={geometry} size={viewBoxSize} opacity={lineOpacity * 1.5} />
        </g>
      </svg>
    </div>
  )
}
```

**Step 2: Add slow spin animation to index.css**

Add to the core animations section:
```css
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

**Step 3: Commit**
```bash
git add frontend/src/components/breathing/ConcentricRings.tsx frontend/src/index.css
git commit -m "feat: create ConcentricRings SVG component with technique geometry overlays"
```

---

### Task 7: Replace FluidOrb with ConcentricRings in BreathingSession

**Files:**
- Modify: `frontend/src/components/breathing/BreathingSession.tsx`
- Modify: `frontend/src/components/breathing/Timer.tsx`
- Modify: `frontend/src/components/breathing/PhaseIndicator.tsx`

**Step 1: Update BreathingSession to use ConcentricRings**

Key changes:
- Replace `FluidOrb` import with `ConcentricRings`
- Change background from `BG` (dark navy) to `var(--breath-canvas)` — or keep dark for immersive? Decision: use the canvas color, matching the app. Session is now light parchment.
- Replace technique gradient buttons with flat ink buttons.
- Replace colored round progress segments with monochromatic ink.
- Phase label and timer use Cormorant Garamond.

In the JSX:
- Replace `style={{ backgroundColor: BG }}` with `style={{ backgroundColor: 'var(--breath-canvas, #F5F2ED)' }}` and add a `.dark &` override.
- Actually, for the session we should respect the current theme. Use CSS variables: `className="bg-[var(--breath-canvas)]"` or the `breath-bg` class.
- Replace `<FluidOrb ...>` with `<ConcentricRings phase={...} amplitude={amplitude} isActive={isActive && !isPaused} techniqueId={config.techniqueId} className="w-full h-full" />`
- Timer and phase colors should use `text-bw` instead of `text-white`.
- Control buttons: replace `bg-white/10 border-white/10 text-white` with `bg-bw-hover border-bw-border text-bw`.

**Step 2: Update Timer.tsx**

Change to use Cormorant Garamond display font, larger weight:
- Replace `font-mono` with `font-display` and `font-light` (300 weight).
- Use `tracking-[0.04em]` for the display letter-spacing.

**Step 3: Update PhaseIndicator.tsx**

- Replace technique color dot with a small geometric symbol.
- Use Cormorant Garamond for the phase name.
- Remove all color-based styling.

**Step 4: Commit**
```bash
git add frontend/src/components/breathing/BreathingSession.tsx frontend/src/components/breathing/Timer.tsx frontend/src/components/breathing/PhaseIndicator.tsx
git commit -m "feat: replace FluidOrb with ConcentricRings, monochromatic session UI"
```

---

### Task 8: Redesign Home page — manuscript layout with geometry cards

**Files:**
- Modify: `frontend/src/pages/Home.tsx`

**Step 1: Update Home page**

Key changes:
- Greeting: use `font-display font-light` (Cormorant Garamond 300) for main heading.
- Stats: use Cormorant Garamond 300 for numbers, Inter small caps for labels. Use middle dot `·` as separators.
- Technique cards: remove all `style={techniqueCardGradient(...)}`. Instead, use flat bordered cards with the technique's geometric SVG icon in the top-right corner.
- Replace Lucide icons for techniques with small inline SVG geometric symbols matching each technique's geometry (grid for box, triangle for CO2, octagram for power, spiral for cyclic sighing).
- Left-align text on desktop (remove center alignment).
- Use varied spacing: section gaps of `pt-12 md:pt-24` instead of uniform `pt-8 md:pt-16`.
- Replace `font-display font-extrabold` with `font-display font-light` for headings (the calligraphic beauty of Garamond comes out at light weight).
- Add small caps labels: `text-[11px] font-medium tracking-[0.08em] uppercase` for metadata.

**Step 2: Create TechniqueIcon component or inline SVGs**

Small SVG symbols for each technique (16x16):
- Box: 4-line grid
- CO2: triangle
- Power: 8-pointed star
- Cyclic Sighing: spiral

These replace the Lucide icons in technique cards and session history.

**Step 3: Commit**
```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat: redesign Home page with manuscript layout, geometry technique icons"
```

---

### Task 9: Update Header and Navigation — minimal, no blur

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/layout/Navigation.tsx`

**Step 1: Redesign Header**

- Remove backdrop blur. Use solid canvas color with 1px bottom border.
- Logo: replace `Wind` icon in dark box with the word "BreathFlow" in Cormorant Garamond 300 with a small geometric rosette.
- Nav items: Inter 500, small caps tracking, no background on active. Active state = heavier font weight (600) + full ink color. Inactive = `text-bw-tertiary`.
- Remove rounded pill backgrounds on nav items.

**Step 2: Redesign Navigation (mobile bottom bar)**

- Remove backdrop blur. Solid canvas background with 1px top border.
- Remove the sliding active indicator pill. Replace with: active icon gets `strokeWidth: 2` (thicker line), inactive stays at `1.5`.
- Label appears in small caps below active icon only.
- Remove rounded card container. Make it a flat bar.

**Step 3: Commit**
```bash
git add frontend/src/components/layout/Header.tsx frontend/src/components/layout/Navigation.tsx
git commit -m "feat: minimal header/nav — no blur, solid canvas, small caps labels"
```

---

### Task 10: Update animation system — slow deceleration, stagger timing

**Files:**
- Modify: `frontend/src/index.css` (animation section)
- Modify: `frontend/src/pages/Home.tsx` (motion variants)

**Step 1: Update CSS animations**

Replace spring-smooth easing references with `var(--ease-decel)`. Update stagger timing from `0.06s` to `0.08s`. Update `animate-slide-up` to use `translateY(8px)` instead of `24px` (subtler).

**Step 2: Update Home.tsx motion variants**

```typescript
const spring = { type: 'tween' as const, duration: 0.6, ease: [0.33, 0, 0, 1] }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring },
}
```

**Step 3: Commit**
```bash
git add frontend/src/index.css frontend/src/pages/Home.tsx
git commit -m "feat: slow deceleration easing, subtler stagger animations"
```

---

### Task 11: Update remaining pages — Settings, Progress

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/Progress.tsx`

**Step 1: Update Settings.tsx**

- Replace any `style={{ background: ACCENT }}` with `style={{ background: 'var(--bw-text)' }}` (ink color).
- Update headings to use `font-display font-light`.
- Section labels in small caps Inter.
- Theme toggle buttons: simple bordered rectangles, active state has ink fill.

**Step 2: Update Progress.tsx**

- Stats use Cormorant Garamond 300 at large size.
- Labels use Inter small caps.
- Replace technique gradient indicators with small geometric SVGs.
- Heatmap cells use the new ink-based `HEATMAP` values from palette.
- Achievement badges use ink colors instead of amber.
- Chart styling respects new tokens.

**Step 3: Commit**
```bash
git add frontend/src/pages/Settings.tsx frontend/src/pages/Progress.tsx
git commit -m "feat: update Settings and Progress pages with monochromatic theme"
```

---

### Task 12: Update theme-color meta and dark session background

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/components/layout/BreathworkLayout.tsx`

**Step 1: Update meta theme-color**

Change from `#030014` to `#F5F2ED` (parchment).

**Step 2: Update BreathworkLayout**

No major changes needed — it already uses `breath-bg` class and `breathwork` class, which now resolve to parchment colors.

Verify the layout max-width works with the manuscript style. Consider reducing from `max-w-5xl` to `max-w-2xl` (680px) on the content container for the tighter manuscript feel.

**Step 3: Commit**
```bash
git add frontend/index.html frontend/src/components/layout/BreathworkLayout.tsx
git commit -m "feat: update meta theme-color, tighten content max-width for manuscript layout"
```

---

### Task 13: Visual QA and polish

**Step 1: Start dev server and check all pages**

Run: `cd frontend && bun run dev`

Check in browser:
- Home page (light + dark)
- Breathing session (start a session, observe ConcentricRings)
- Progress page
- Settings page
- Mobile viewport

**Step 2: Fix any remaining hardcoded colors**

Search for remaining hex colors that don't match the new palette:
```bash
grep -rn '#050816\|#0a0f1e\|#6366F1\|#818CF8\|#4F46E5\|#3730A3\|#D4A04A\|#E8BE72\|#56B4A9\|#D47670\|#7CB88A' frontend/src/ --include='*.tsx' --include='*.ts'
```

Fix any found.

**Step 3: Fix any remaining gradient-text or glow references**

```bash
grep -rn 'gradient-text\|glow\|blur(' frontend/src/ --include='*.tsx' --include='*.ts'
```

Remove any leftover gradient text classes or blur effects in breathwork components.

**Step 4: Commit**
```bash
git add -A
git commit -m "polish: fix remaining hardcoded colors and stale references"
```

---

### Task 14: Take screenshots and create PR

**Step 1: Take screenshots**

Use Chrome MCP tools to capture:
- Home page (light)
- Home page (dark)
- Breathing session with ConcentricRings
- Progress page
- Settings page

**Step 2: Create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: Sufi-mathematical theme redesign" --body "..."
```

Include screenshots in the PR body.
