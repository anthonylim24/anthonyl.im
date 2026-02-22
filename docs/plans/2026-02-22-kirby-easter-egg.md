# Kirby Easter Egg Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a hidden easter egg where tapping the breathing orb 5 times in 2 seconds fills the screen with bouncing Kirbys; the orb itself becomes a Kirby that puffs in and out with the breathing cycle.

**Architecture:** A shared `KirbyCharacter` SVG component is reused in both the orb replacement (`FluidOrb`) and the bouncing background overlay (`KirbyEasterEgg`). The overlay uses a `requestAnimationFrame` loop with direct DOM mutation (no React re-renders per frame) for 60fps bouncing physics. Toggle state lives in `BreathingSession` and flows down as props.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Tailwind CSS, inline SVG

---

## Task 1: Create `KirbyCharacter` SVG component

**Files:**
- Create: `frontend/src/components/breathing/KirbyCharacter.tsx`
- Create: `frontend/src/components/breathing/__tests__/KirbyCharacter.test.tsx`

### Step 1: Write the failing test

```tsx
// frontend/src/components/breathing/__tests__/KirbyCharacter.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { KirbyCharacter } from '../KirbyCharacter'

describe('KirbyCharacter', () => {
  it('renders an SVG element', () => {
    const { container } = render(<KirbyCharacter />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders at the specified size', () => {
    const { container } = render(<KirbyCharacter size={50} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('50px')
    expect(wrapper.style.height).toBe('50px')
  })

  it('puffed cheeks are larger than flat cheeks', () => {
    const { container: flat } = render(<KirbyCharacter puffAmount={0} />)
    const { container: puffed } = render(<KirbyCharacter puffAmount={1} />)
    const flatRx = Number(flat.querySelectorAll('ellipse[fill="#FF85A1"]')[0].getAttribute('rx'))
    const puffedRx = Number(puffed.querySelectorAll('ellipse[fill="#FF85A1"]')[0].getAttribute('rx'))
    expect(puffedRx).toBeGreaterThan(flatRx)
  })

  it('applies additional style and className', () => {
    const { container } = render(
      <KirbyCharacter style={{ opacity: 0.5 }} className="test-class" />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.opacity).toBe('0.5')
    expect(wrapper.classList.contains('test-class')).toBe(true)
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/KirbyCharacter.test.tsx
```

Expected: FAIL — `KirbyCharacter` not found.

### Step 3: Implement `KirbyCharacter`

```tsx
// frontend/src/components/breathing/KirbyCharacter.tsx
import type { CSSProperties } from 'react'

interface KirbyCharacterProps {
  size?: number
  puffAmount?: number // 0–1; controls how inflated the cheeks are
  style?: CSSProperties
  className?: string
}

export function KirbyCharacter({
  size = 100,
  puffAmount = 0,
  style,
  className,
}: KirbyCharacterProps) {
  const cheekRx = 11 + puffAmount * 5
  const cheekRy = 8 + puffAmount * 4

  return (
    <div style={{ width: size, height: size, ...style }} className={className}>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        {/* Arms (behind body) */}
        <ellipse cx="11" cy="64" rx="9" ry="12" fill="#FFB8D4" />
        <ellipse cx="89" cy="64" rx="9" ry="12" fill="#FFB8D4" />
        {/* Feet (behind body) */}
        <ellipse cx="33" cy="88" rx="16" ry="9" fill="#DB5A7B" />
        <ellipse cx="67" cy="88" rx="16" ry="9" fill="#DB5A7B" />
        {/* Body */}
        <ellipse cx="50" cy="52" rx="42" ry="40" fill="#FFB8D4" />
        {/* Cheeks — expand with puffAmount */}
        <ellipse cx="21" cy="58" rx={cheekRx} ry={cheekRy} fill="#FF85A1" opacity="0.65" />
        <ellipse cx="79" cy="58" rx={cheekRx} ry={cheekRy} fill="#FF85A1" opacity="0.65" />
        {/* Eyes */}
        <ellipse cx="35" cy="46" rx="8" ry="10" fill="#1a1a2e" />
        <ellipse cx="65" cy="46" rx="8" ry="10" fill="#1a1a2e" />
        {/* Eye highlights */}
        <circle cx="32" cy="42" r="3" fill="white" />
        <circle cx="62" cy="42" r="3" fill="white" />
        {/* Mouth */}
        <ellipse cx="50" cy="65" rx="5" ry="4" fill="#C0405A" />
      </svg>
    </div>
  )
}
```

### Step 4: Run test to verify it passes

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/KirbyCharacter.test.tsx
```

Expected: PASS — all 4 tests green.

### Step 5: Commit

```bash
git add frontend/src/components/breathing/KirbyCharacter.tsx \
        frontend/src/components/breathing/__tests__/KirbyCharacter.test.tsx
git commit -m "feat: add KirbyCharacter SVG component with puff animation support"
```

---

## Task 2: Create `KirbyEasterEgg` bouncing overlay

**Files:**
- Create: `frontend/src/components/breathing/KirbyEasterEgg.tsx`
- Create: `frontend/src/components/breathing/__tests__/KirbyEasterEgg.test.tsx`

### Step 1: Write the failing test

```tsx
// frontend/src/components/breathing/__tests__/KirbyEasterEgg.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KirbyEasterEgg } from '../KirbyEasterEgg'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KirbyEasterEgg', () => {
  it('renders the overlay container', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()
  })

  it('overlay has pointer-events-none', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg').className).toContain('pointer-events-none')
  })

  it('renders 11 Kirby instances', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getAllByTestId('kirby-instance')).toHaveLength(11)
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/KirbyEasterEgg.test.tsx
```

Expected: FAIL — `KirbyEasterEgg` not found.

### Step 3: Implement `KirbyEasterEgg`

```tsx
// frontend/src/components/breathing/KirbyEasterEgg.tsx
import { useEffect, useRef } from 'react'
import { KirbyCharacter } from './KirbyCharacter'

const KIRBY_COUNT = 11

interface KirbyInstance {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

function createKirbys(): KirbyInstance[] {
  return Array.from({ length: KIRBY_COUNT }, (_, id) => ({
    id,
    x: Math.random() * Math.max(window.innerWidth - 70, 0),
    y: Math.random() * Math.max(window.innerHeight - 70, 0),
    vx: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1),
    vy: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1),
    size: Math.floor(Math.random() * 41) + 30, // 30–70px
  }))
}

export function KirbyEasterEgg() {
  const kirbysRef = useRef<KirbyInstance[]>(createKirbys())
  const kirbyElemsRef = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const loop = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      for (let i = 0; i < kirbysRef.current.length; i++) {
        const k = kirbysRef.current[i]
        k.x += k.vx
        k.y += k.vy
        // Bounce off edges
        if (k.x <= 0) { k.x = 0; k.vx = Math.abs(k.vx) }
        if (k.x >= w - k.size) { k.x = w - k.size; k.vx = -Math.abs(k.vx) }
        if (k.y <= 0) { k.y = 0; k.vy = Math.abs(k.vy) }
        if (k.y >= h - k.size) { k.y = h - k.size; k.vy = -Math.abs(k.vy) }
        const el = kirbyElemsRef.current[i]
        if (el) {
          el.style.transform = `translate(${k.x}px, ${k.y}px)`
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      data-testid="kirby-easter-egg"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    >
      {kirbysRef.current.map((k, i) => (
        <div
          key={k.id}
          data-testid="kirby-instance"
          ref={(el) => { kirbyElemsRef.current[i] = el }}
          className="absolute"
          style={{
            width: k.size,
            height: k.size,
            transform: `translate(${k.x}px, ${k.y}px)`,
            opacity: 0.85,
          }}
        >
          <KirbyCharacter size={k.size} />
        </div>
      ))}
    </div>
  )
}
```

### Step 4: Run test to verify it passes

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/KirbyEasterEgg.test.tsx
```

Expected: PASS — all 3 tests green.

### Step 5: Commit

```bash
git add frontend/src/components/breathing/KirbyEasterEgg.tsx \
        frontend/src/components/breathing/__tests__/KirbyEasterEgg.test.tsx
git commit -m "feat: add KirbyEasterEgg bouncing overlay with RAF physics"
```

---

## Task 3: Modify `FluidOrb` — add tap detection and Kirby rendering

**Files:**
- Modify: `frontend/src/components/breathing/FluidOrb.tsx`
- Modify: `frontend/src/components/breathing/__tests__/FluidOrb.test.tsx`

### Step 1: Add tests for kirby mode and tap detection

Append these test cases to the existing `describe('FluidOrb', ...)` block in `FluidOrb.test.tsx`:

```tsx
// Add at top of the file with existing imports:
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FluidOrb } from '../FluidOrb'
import { BREATH_PHASES } from '@/lib/constants'

// New tests to add inside the existing describe block:

it('renders an SVG Kirby when kirbyMode is true', () => {
  const { container } = render(
    <FluidOrb phase={null} amplitude={0.5} isActive={true} kirbyMode={true} />
  )
  expect(container.querySelector('svg')).toBeTruthy()
})

it('does not render an SVG when kirbyMode is false', () => {
  const { container } = render(
    <FluidOrb phase={null} amplitude={0.5} isActive={true} kirbyMode={false} />
  )
  expect(container.querySelector('svg')).toBeFalsy()
})

it('calls onEasterEggToggle after 5 clicks within 2 seconds', async () => {
  const onToggle = vi.fn()
  let t = 0
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

  const { getByTestId } = render(
    <FluidOrb
      phase={null}
      amplitude={0.5}
      isActive={true}
      onEasterEggToggle={onToggle}
    />
  )
  const orb = getByTestId('fluid-orb')
  for (let i = 0; i < 5; i++) {
    await userEvent.click(orb)
  }
  expect(onToggle).toHaveBeenCalledTimes(1)
  vi.restoreAllMocks()
})

it('does not call onEasterEggToggle for 5 clicks spread over more than 2 seconds', async () => {
  const onToggle = vi.fn()
  let t = 0
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))

  const { getByTestId } = render(
    <FluidOrb
      phase={null}
      amplitude={0.5}
      isActive={true}
      onEasterEggToggle={onToggle}
    />
  )
  const orb = getByTestId('fluid-orb')
  for (let i = 0; i < 5; i++) {
    await userEvent.click(orb)
  }
  expect(onToggle).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})
```

### Step 2: Run tests to verify new tests fail

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/FluidOrb.test.tsx
```

Expected: FAIL on the 4 new tests (`fluid-orb` testid not found, kirby SVG tests fail).

### Step 3: Modify `FluidOrb.tsx`

Replace the entire file contents with:

```tsx
// frontend/src/components/breathing/FluidOrb.tsx
import { useMemo, useRef, useCallback } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { KirbyCharacter } from './KirbyCharacter'

interface FluidOrbProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  themeColors?: [string, string]
  className?: string
  kirbyMode?: boolean
  onEasterEggToggle?: () => void
}

const PHASE_COLORS: Record<string, [string, string]> = {
  [BREATH_PHASES.INHALE]: ['#8B96FF', '#6E7BF2'],
  [BREATH_PHASES.DEEP_INHALE]: ['#99A5FF', '#8B96FF'],
  [BREATH_PHASES.HOLD_IN]: ['#B0B8FF', '#8B96FF'],
  [BREATH_PHASES.EXHALE]: ['#5B6AD4', '#4B55B8'],
  [BREATH_PHASES.HOLD_OUT]: ['#3D4A9E', '#2A3370'],
  [BREATH_PHASES.REST]: ['#2A3370', '#1E2550'],
  idle: ['#1E2550', '#2A3370'],
}

export function FluidOrb({
  phase,
  amplitude,
  isActive,
  themeColors,
  className,
  kirbyMode = false,
  onEasterEggToggle,
}: FluidOrbProps) {
  const colors = themeColors ?? PHASE_COLORS[phase ?? 'idle']
  const scale = 0.6 + amplitude * 0.4
  const morphAmount = isActive ? amplitude * 15 : 0
  const borderRadius = useMemo(() => {
    const base = 50
    const r1 = base + morphAmount
    const r2 = base - morphAmount * 0.5
    const r3 = base + morphAmount * 0.7
    const r4 = base - morphAmount * 0.3
    return `${r1}% ${r2}% ${r3}% ${r4}% / ${r2}% ${r3}% ${r4}% ${r1}%`
  }, [morphAmount])

  const transitionDuration = isActive ? '800ms' : '1200ms'

  // Tap detection: 5 taps within 2 seconds triggers the easter egg toggle
  const tapTimestampsRef = useRef<number[]>([])
  const handleClick = useCallback(() => {
    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2000)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length >= 5) {
      tapTimestampsRef.current = []
      onEasterEggToggle?.()
    }
  }, [onEasterEggToggle])

  if (kirbyMode) {
    return (
      <div
        data-testid="fluid-orb"
        className={cn('relative flex items-center justify-center', className)}
        onClick={handleClick}
      >
        <div
          style={{
            transform: `translateZ(0) scale(${scale})`,
            transition: `transform ${transitionDuration} ease-out`,
            willChange: 'transform',
          }}
        >
          <KirbyCharacter size={200} puffAmount={amplitude} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="fluid-orb"
      className={cn('relative flex items-center justify-center', className)}
      onClick={handleClick}
    >
      {/* Outer glow — use transform: scale instead of width/height to stay on GPU */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          width: '110%',
          height: '110%',
          maxWidth: '340px',
          maxHeight: '340px',
          transform: `translateZ(0) scale(${scale})`,
          background: `radial-gradient(circle, ${colors[0]}40, transparent 70%)`,
          opacity: isActive ? 0.8 : 0.3,
          transition: `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
          willChange: 'transform, opacity',
        }}
      />
      {/* Secondary glow */}
      <div
        className="absolute rounded-full blur-xl"
        style={{
          width: '90%',
          height: '90%',
          maxWidth: '280px',
          maxHeight: '280px',
          transform: `translateZ(0) scale(${scale})`,
          background: `radial-gradient(circle, ${colors[1]}30, transparent 60%)`,
          opacity: isActive ? 0.6 : 0.2,
          transition: `transform ${transitionDuration} ease-out, opacity ${transitionDuration} ease-out`,
          willChange: 'transform, opacity',
        }}
      />
      {/* Main orb */}
      <div
        className="relative"
        style={{
          width: '70%',
          height: '70%',
          maxWidth: '220px',
          maxHeight: '220px',
          transform: `translateZ(0) scale(${scale})`,
          borderRadius,
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          boxShadow: `
            0 0 60px ${colors[0]}40,
            0 0 120px ${colors[0]}20,
            inset 0 -20px 40px ${colors[1]}40,
            inset 0 20px 40px rgba(255,255,255,0.15)
          `,
          transition: `transform ${transitionDuration} ease-out, border-radius ${transitionDuration} ease-out`,
          willChange: 'transform, border-radius',
        }}
      >
        <div
          className="absolute top-[15%] left-[20%] rounded-full"
          style={{
            width: '40%',
            height: '25%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4), transparent)',
            filter: 'blur(8px)',
            transform: 'translateZ(0)',
          }}
        />
      </div>
    </div>
  )
}
```

### Step 4: Run tests to verify all pass

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/FluidOrb.test.tsx
```

Expected: PASS — all 8 tests green (4 original + 4 new).

### Step 5: Commit

```bash
git add frontend/src/components/breathing/FluidOrb.tsx \
        frontend/src/components/breathing/__tests__/FluidOrb.test.tsx
git commit -m "feat: add kirby mode and easter egg tap detection to FluidOrb"
```

---

## Task 4: Wire everything in `BreathingSession`

**Files:**
- Modify: `frontend/src/components/breathing/BreathingSession.tsx`
- Create: `frontend/src/components/breathing/__tests__/BreathingSession.easterEgg.test.tsx`

### Step 1: Write the failing test

```tsx
// frontend/src/components/breathing/__tests__/BreathingSession.easterEgg.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

// Same mocks as the existing responsive test
vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 0 }),
}))
vi.mock('@/hooks/useWaveform', () => ({
  useWaveform: () => ({ amplitude: 0.5 }),
}))
vi.mock('@/hooks/useBreathingCycle', () => ({
  useBreathingCycle: () => ({
    session: {
      startTime: new Date('2026-01-01T00:00:00.000Z'),
      currentRound: 0,
      currentPhaseIndex: 0,
      currentPhase: 'inhale',
      timeRemaining: 4,
      isPaused: false,
      isComplete: false,
      holdTimes: [],
    },
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    isActive: false,
    isPaused: false,
    isComplete: false,
  }),
}))
vi.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: () => ({
    addXP: vi.fn(),
    unlockBadges: vi.fn(),
    recordSession: vi.fn(),
    earnedBadges: [],
  }),
}))
vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: [],
    getStreak: () => 0,
  }),
}))

const CONFIG = { techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BreathingSession easter egg', () => {
  it('does not show KirbyEasterEgg initially', () => {
    render(<BreathingSession config={CONFIG} />)
    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
  })

  it('shows KirbyEasterEgg after 5 rapid orb taps', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByTestId('fluid-orb')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()
  })

  it('hides KirbyEasterEgg after a second set of 5 rapid taps', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByTestId('fluid-orb')

    // First 5 taps: activate
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()

    // Second 5 taps: deactivate
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
  })
})
```

### Step 2: Run test to verify it fails

```bash
cd frontend && npm run test:run -- src/components/breathing/__tests__/BreathingSession.easterEgg.test.tsx
```

Expected: FAIL — `fluid-orb` testid not found (FluidOrb not yet receiving new props).

### Step 3: Modify `BreathingSession.tsx`

Make three changes:

**3a.** Add imports at the top (after existing imports):

```tsx
import { KirbyEasterEgg } from './KirbyEasterEgg'
```

**3b.** Add state and toggle callback after the existing `useState` declarations (around line 31):

```tsx
const [kirbyMode, setKirbyMode] = useState(false)
const toggleKirbyMode = useCallback(() => setKirbyMode((prev) => !prev), [])
```

**3c.** In the return JSX, make two edits:

After the opening `<div className="fixed inset-0 z-[60] ...">` (line 177), add the overlay as the **first child**:

```tsx
{/* Kirby Easter Egg — background layer, behind all UI */}
{kirbyMode && <KirbyEasterEgg />}
```

Then update the `<FluidOrb />` call to pass the new props:

```tsx
<FluidOrb
  phase={session?.currentPhase ?? null}
  amplitude={amplitude}
  isActive={isActive && !isPaused}
  className="w-full h-full"
  kirbyMode={kirbyMode}
  onEasterEggToggle={toggleKirbyMode}
/>
```

### Step 4: Run all tests

```bash
cd frontend && npm run test:run
```

Expected: All tests PASS. The existing responsive test should still pass because `fluid-orb` testid is now present (we added it to `FluidOrb`) and nothing else changed in `BreathingSession`.

### Step 5: Commit

```bash
git add frontend/src/components/breathing/BreathingSession.tsx \
        frontend/src/components/breathing/__tests__/BreathingSession.easterEgg.test.tsx
git commit -m "feat: wire Kirby easter egg into BreathingSession"
```

---

## Final verification

Run the full test suite one more time to confirm everything is green:

```bash
cd frontend && npm run test:run
```

Then do a quick manual check in the browser:
1. Start a breathing session
2. Click the orb 5 times quickly — Kirbys should appear and bounce around edges; orb becomes a Kirby that puffs with breathing
3. Click the orb 5 times quickly again — everything returns to normal
4. Confirm the controls, timer, and phase indicator are never obscured by background Kirbys
