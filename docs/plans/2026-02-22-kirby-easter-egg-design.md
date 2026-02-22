# Kirby Easter Egg — Design Doc

**Date:** 2026-02-22
**Status:** Approved

---

## Overview

Add a hidden easter egg to the breathwork app where the screen fills with bouncing Kirbys. The main breathing orb is replaced by a Kirby that puffs in and out with the breathing cycle. The core breathwork flow is never interrupted — only the visuals change.

---

## Activation & Dismissal

- **Trigger:** Tap/click the breathing orb 5 times within 2 seconds.
- **Toggle:** The same gesture dismisses it and restores the normal orb.
- **Persistence:** Not saved to localStorage. Resets on page reload or session end.

---

## Visual Behavior

### Main Orb → Kirby Replacement

The `FluidOrb` glow divs are replaced by an inline SVG Kirby character. The same `amplitude` value from `useWaveform` that currently drives the orb scale drives Kirby's scale instead:

- Inhale: Kirby scales up, cheeks inflate.
- Exhale: Kirby scales down.
- Hold: Kirby holds size with a subtle wobble (same as existing orb hold behavior).

The Kirby stays centered in the orb container at the same position as the original orb.

### Background Bouncing Kirbys

10–12 small Kirby instances rendered in a full-screen absolutely-positioned overlay behind all UI content. Each Kirby:

- Starts at a random position on screen.
- Has a random velocity vector (vx, vy).
- Bounces off all four screen edges (elastic reflection: negate relevant velocity component on edge collision).
- Rotates slightly based on horizontal velocity direction (flips to face direction of travel).
- Varies in size (30px to 70px).

**Animation implementation:** `requestAnimationFrame` loop inside a `useEffect` in `KirbyEasterEgg`. Positions tracked in a ref (not state) to avoid re-renders. DOM positions updated directly via `style.transform` on element refs.

### Z-index / Layering

The `KirbyEasterEgg` overlay sits **behind** all main UI content:
- `z-index: 0` for the overlay (background layer).
- `pointer-events: none` so it never blocks controls, timers, or phase indicators.
- The main Kirby orb replaces the existing orb in its normal z-position.

---

## Component Architecture

```
BreathingSession.tsx          ← holds kirbyMode: boolean state
├── KirbyEasterEgg.tsx        ← full-screen overlay, z-0, pointer-events-none
│   └── KirbyCharacter.tsx × 10–12  ← bouncing Kirbys, positions driven by RAF
└── FluidOrb.tsx              ← receives kirbyMode + onEasterEggToggle props
    ├── Tap counter logic     ← 5 taps within 2s toggles kirbyMode
    ├── Normal mode: existing glow divs (unchanged)
    └── Kirby mode: KirbyCharacter.tsx scaled by amplitude
```

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/breathing/KirbyCharacter.tsx` | Inline SVG Kirby, accepts `size` and `style` props |
| `frontend/src/components/breathing/KirbyEasterEgg.tsx` | Full-screen overlay managing bouncing Kirby RAF loop |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/components/breathing/FluidOrb.tsx` | Add tap counter; when `kirbyMode`, render `KirbyCharacter` scaled by amplitude instead of glow divs |
| `frontend/src/components/breathing/BreathingSession.tsx` | Add `kirbyMode` state; pass to `FluidOrb`; render `KirbyEasterEgg` when active |

---

## KirbyCharacter SVG Spec

Simple inline SVG (100×100 viewBox) depicting classic Kirby:

- **Body:** Large pink ellipse
- **Eyes:** Two dark ovals with white highlight dots
- **Cheeks:** Two rose-tinted ovals, semi-transparent
- **Mouth:** Small dark oval
- **Feet:** Two rounded ovals at the bottom (darker pink)
- **Arms:** Two small ovals on the sides

The SVG is wrapped in a `div` that receives `style={{ transform: scale(...) }}` from the parent for breathing animation.

---

## Tap Detection Logic

```
clickTimestamps ref: number[]

On each click of the orb:
1. Push Date.now() to clickTimestamps
2. Filter out timestamps older than 2000ms
3. If clickTimestamps.length >= 5:
   - Toggle kirbyMode
   - Clear clickTimestamps
```

---

## Bouncing Physics

Each Kirby entry:
```
{ id, x, y, vx, vy, size }
```

RAF loop (in KirbyEasterEgg):
```
x += vx
y += vy
if x <= 0 or x >= windowWidth - size: vx = -vx
if y <= 0 or y >= windowHeight - size: vy = -vy
element.style.transform = `translate(${x}px, ${y}px)`
```

Velocity ranges: vx and vy each between ±1 and ±3 pixels per frame (~60fps → 60–180px/s).
