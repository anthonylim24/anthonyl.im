# Breathwork App Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the breathwork app with a premium dark-first aesthetic, fluid orb animation, XP/level gamification, achievement badges, and comprehensive test coverage.

**Architecture:** Keep existing Zustand stores and `useBreathingCycle` hook. Add `gamificationStore` and `settingsStore`. Replace SVG WaveformVisualizer with CSS-based FluidOrb. Restructure pages: Dashboard, Session (immersive), Progress (badges + stats), Settings. All gamification state persisted to localStorage.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Vitest + React Testing Library, Recharts, Radix UI, Lucide icons.

---

### Task 1: Set Up Vitest Testing Infrastructure

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/package.json` (add vitest deps and test script)
- Modify: `frontend/tsconfig.app.json` (add vitest types)

**Step 1: Install vitest and testing dependencies**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun add -d vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
Expected: Dependencies added to package.json

**Step 2: Create vitest config**

Create `frontend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create test setup file**

Create `frontend/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

**Step 4: Add test script to package.json**

Add to `frontend/package.json` scripts:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 5: Verify vitest runs**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run`
Expected: Vitest runs with 0 test files found (no errors)

**Step 6: Commit**

```bash
git add frontend/vitest.config.ts frontend/src/test/setup.ts frontend/package.json frontend/bun.lockb frontend/tsconfig.app.json
git commit -m "feat(breathwork): add vitest testing infrastructure"
```

---

### Task 2: Gamification Logic - Constants, Types, and XP Calculations

**Files:**
- Create: `frontend/src/lib/gamification.ts`
- Create: `frontend/src/lib/__tests__/gamification.test.ts`

**Step 1: Write failing tests for gamification logic**

Create `frontend/src/lib/__tests__/gamification.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  calculateXP,
  getLevelForXP,
  getLevelTitle,
  getXPForLevel,
  checkBadgeUnlocks,
  BADGES,
  ORB_THEMES,
  getUnlockedThemes,
} from '../gamification'
import { TECHNIQUE_IDS } from '../constants'

describe('calculateXP', () => {
  it('returns base XP for box breathing with default rounds', () => {
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 1)).toBe(50)
  })

  it('returns base XP for CO2 tolerance with default rounds', () => {
    expect(calculateXP(TECHNIQUE_IDS.CO2_TOLERANCE, 8, 1)).toBe(75)
  })

  it('returns base XP for power breathing with default rounds', () => {
    expect(calculateXP(TECHNIQUE_IDS.POWER_BREATHING, 3, 1)).toBe(60)
  })

  it('adds bonus XP for extra rounds beyond default', () => {
    // Box default is 4 rounds, doing 6 = +10 bonus
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 6, 1)).toBe(60)
  })

  it('applies streak multiplier capped at 2.0', () => {
    // Streak of 5: multiplier = min(1 + 5 * 0.1, 2.0) = 1.5
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 5)).toBe(75)
  })

  it('caps streak multiplier at 2.0', () => {
    // Streak of 20: multiplier = min(1 + 20 * 0.1, 2.0) = 2.0
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 20)).toBe(100)
  })

  it('returns no bonus for fewer rounds than default', () => {
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 2, 1)).toBe(50)
  })
})

describe('getLevelForXP', () => {
  it('returns level 1 for 0 XP', () => {
    expect(getLevelForXP(0)).toBe(1)
  })

  it('returns level 2 at 100 XP', () => {
    expect(getLevelForXP(100)).toBe(2)
  })

  it('returns correct level for large XP', () => {
    const level = getLevelForXP(10000)
    expect(level).toBeGreaterThan(10)
    expect(level).toBeLessThanOrEqual(50)
  })

  it('caps at level 50', () => {
    expect(getLevelForXP(999999)).toBe(50)
  })
})

describe('getLevelTitle', () => {
  it('returns title for level 1', () => {
    expect(getLevelTitle(1)).toBe('First Breath')
  })

  it('returns title for level 50', () => {
    expect(getLevelTitle(50)).toBe('Breath Master')
  })
})

describe('getXPForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(getXPForLevel(1)).toBe(0)
  })

  it('returns 100 for level 2', () => {
    expect(getXPForLevel(2)).toBe(100)
  })

  it('increases progressively', () => {
    const xp5 = getXPForLevel(5)
    const xp6 = getXPForLevel(6)
    const xp7 = getXPForLevel(7)
    expect(xp6 - xp5).toBeLessThan(xp7 - xp6)
  })
})

describe('checkBadgeUnlocks', () => {
  it('unlocks first_session badge after 1 session', () => {
    const unlocked = checkBadgeUnlocks({
      totalSessions: 1,
      streak: 0,
      totalSeconds: 120,
      sessionsByTechnique: { box_breathing: 1, co2_tolerance: 0, power_breathing: 0 },
      maxHoldByTechnique: {},
      sessionHour: 14,
      sessionDurationSeconds: 120,
    })
    expect(unlocked).toContain('first_session')
  })

  it('unlocks night_owl for session after midnight', () => {
    const unlocked = checkBadgeUnlocks({
      totalSessions: 5,
      streak: 1,
      totalSeconds: 600,
      sessionsByTechnique: { box_breathing: 5, co2_tolerance: 0, power_breathing: 0 },
      maxHoldByTechnique: {},
      sessionHour: 2,
      sessionDurationSeconds: 120,
    })
    expect(unlocked).toContain('night_owl')
  })

  it('unlocks marathon for 15+ min session', () => {
    const unlocked = checkBadgeUnlocks({
      totalSessions: 5,
      streak: 1,
      totalSeconds: 3600,
      sessionsByTechnique: { box_breathing: 5, co2_tolerance: 0, power_breathing: 0 },
      maxHoldByTechnique: {},
      sessionHour: 14,
      sessionDurationSeconds: 901,
    })
    expect(unlocked).toContain('marathon')
  })
})

describe('getUnlockedThemes', () => {
  it('returns only default theme at level 1', () => {
    expect(getUnlockedThemes(1)).toHaveLength(1)
    expect(getUnlockedThemes(1)[0].id).toBe('default')
  })

  it('includes aurora at level 5', () => {
    const themes = getUnlockedThemes(5)
    expect(themes.find(t => t.id === 'aurora')).toBeDefined()
  })

  it('includes all themes at level 50', () => {
    expect(getUnlockedThemes(50)).toHaveLength(ORB_THEMES.length)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/lib/__tests__/gamification.test.ts`
Expected: FAIL - module not found

**Step 3: Implement gamification logic**

Create `frontend/src/lib/gamification.ts`:
```ts
import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { breathingProtocols } from './breathingProtocols'

// --- XP Configuration ---

const BASE_XP: Record<TechniqueId, number> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: 50,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: 75,
  [TECHNIQUE_IDS.POWER_BREATHING]: 60,
}

const BONUS_XP_PER_EXTRA_ROUND = 5
const STREAK_MULTIPLIER_STEP = 0.1
const MAX_STREAK_MULTIPLIER = 2.0

export function calculateXP(
  techniqueId: TechniqueId,
  rounds: number,
  streak: number,
): number {
  const base = BASE_XP[techniqueId]
  const defaultRounds = breathingProtocols[techniqueId].defaultRounds
  const extraRounds = Math.max(0, rounds - defaultRounds)
  const bonus = extraRounds * BONUS_XP_PER_EXTRA_ROUND
  const multiplier = Math.min(1 + streak * STREAK_MULTIPLIER_STEP, MAX_STREAK_MULTIPLIER)
  return Math.round((base + bonus) * multiplier)
}

// --- Level System ---
// XP thresholds: level N requires sum of (80 + 20 * i) for i = 1..N-1
// This gives a gentle curve: L2=100, L3=220, L4=360, etc.

export function getXPForLevel(level: number): number {
  if (level <= 1) return 0
  let total = 0
  for (let i = 1; i < level; i++) {
    total += 80 + 20 * i
  }
  return total
}

export function getLevelForXP(xp: number): number {
  for (let level = 50; level >= 1; level--) {
    if (xp >= getXPForLevel(level)) return level
  }
  return 1
}

const LEVEL_TITLES: Record<number, string> = {
  1: 'First Breath',
  2: 'Beginner',
  3: 'Novice',
  4: 'Apprentice',
  5: 'Breath Student',
  10: 'Rhythm Keeper',
  15: 'Steady Breather',
  20: 'Breath Adept',
  25: 'Flow State',
  30: 'Breath Sage',
  35: 'Zen Practitioner',
  40: 'Air Bender',
  45: 'Breath Sensei',
  50: 'Breath Master',
}

export function getLevelTitle(level: number): string {
  // Find the highest key <= level
  const keys = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a)
  for (const key of keys) {
    if (level >= key) return LEVEL_TITLES[key]
  }
  return 'First Breath'
}

// --- Badges ---

export interface Badge {
  id: string
  name: string
  description: string
  icon: string // Lucide icon name
  secret?: boolean
}

export const BADGES: Badge[] = [
  { id: 'first_session', name: 'First Session', description: 'Complete your first session', icon: 'Zap' },
  { id: 'streak_7', name: '7-Day Streak', description: 'Practice 7 days in a row', icon: 'Flame' },
  { id: 'streak_30', name: '30-Day Streak', description: 'Practice 30 days in a row', icon: 'Crown' },
  { id: 'sessions_100', name: 'Century', description: 'Complete 100 sessions', icon: 'Award' },
  { id: 'hour_total', name: 'Hour of Breath', description: 'Accumulate 1 hour of practice', icon: 'Clock' },
  { id: 'ten_hours', name: 'Dedicated', description: 'Accumulate 10 hours of practice', icon: 'Star' },
  { id: 'box_master', name: 'Box Master', description: 'Complete 50 Box Breathing sessions', icon: 'Box' },
  { id: 'co2_explorer', name: 'CO2 Explorer', description: 'Hold your breath for 60+ seconds', icon: 'Flame' },
  { id: 'power_adept', name: 'Power Adept', description: 'Complete 50 Power Breathing sessions', icon: 'Wind' },
  { id: 'night_owl', name: 'Night Owl', description: 'Complete a session after midnight', icon: 'Moon', secret: true },
  { id: 'early_bird', name: 'Early Bird', description: 'Complete a session before 6am', icon: 'Sunrise', secret: true },
  { id: 'marathon', name: 'Marathon', description: 'Complete a session longer than 15 minutes', icon: 'Timer', secret: true },
]

export interface BadgeCheckContext {
  totalSessions: number
  streak: number
  totalSeconds: number
  sessionsByTechnique: Record<string, number>
  maxHoldByTechnique: Record<string, number>
  sessionHour: number
  sessionDurationSeconds: number
}

export function checkBadgeUnlocks(ctx: BadgeCheckContext): string[] {
  const unlocked: string[] = []

  if (ctx.totalSessions >= 1) unlocked.push('first_session')
  if (ctx.streak >= 7) unlocked.push('streak_7')
  if (ctx.streak >= 30) unlocked.push('streak_30')
  if (ctx.totalSessions >= 100) unlocked.push('sessions_100')
  if (ctx.totalSeconds >= 3600) unlocked.push('hour_total')
  if (ctx.totalSeconds >= 36000) unlocked.push('ten_hours')
  if ((ctx.sessionsByTechnique[TECHNIQUE_IDS.BOX_BREATHING] ?? 0) >= 50) unlocked.push('box_master')
  if (Object.values(ctx.maxHoldByTechnique).some(h => h >= 60)) unlocked.push('co2_explorer')
  if ((ctx.sessionsByTechnique[TECHNIQUE_IDS.POWER_BREATHING] ?? 0) >= 50) unlocked.push('power_adept')
  if (ctx.sessionHour >= 0 && ctx.sessionHour < 5) unlocked.push('night_owl')
  if (ctx.sessionHour >= 5 && ctx.sessionHour < 6) unlocked.push('early_bird')
  if (ctx.sessionDurationSeconds > 900) unlocked.push('marathon')

  return unlocked
}

// --- Orb Themes ---

export interface OrbTheme {
  id: string
  name: string
  colors: [string, string] // gradient pair
  unlockLevel: number
}

export const ORB_THEMES: OrbTheme[] = [
  { id: 'default', name: 'Default', colors: ['#3b82f6', '#06b6d4'], unlockLevel: 1 },
  { id: 'aurora', name: 'Aurora', colors: ['#22c55e', '#06b6d4'], unlockLevel: 5 },
  { id: 'ocean', name: 'Ocean', colors: ['#0ea5e9', '#6366f1'], unlockLevel: 10 },
  { id: 'sunset', name: 'Sunset', colors: ['#f97316', '#ec4899'], unlockLevel: 15 },
  { id: 'nebula', name: 'Nebula', colors: ['#8b5cf6', '#ec4899'], unlockLevel: 20 },
  { id: 'ember', name: 'Ember', colors: ['#ef4444', '#f97316'], unlockLevel: 25 },
  { id: 'frost', name: 'Frost', colors: ['#67e8f9', '#a5b4fc'], unlockLevel: 30 },
  { id: 'prism', name: 'Prism', colors: ['#a855f7', '#14b8a6'], unlockLevel: 40 },
  { id: 'transcend', name: 'Transcend', colors: ['#fbbf24', '#f9a8d4'], unlockLevel: 50 },
]

export function getUnlockedThemes(level: number): OrbTheme[] {
  return ORB_THEMES.filter(t => t.unlockLevel <= level)
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/lib/__tests__/gamification.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/gamification.ts frontend/src/lib/__tests__/gamification.test.ts
git commit -m "feat(breathwork): add gamification logic with XP, levels, badges, and orb themes"
```

---

### Task 3: Gamification Store and Settings Store

**Files:**
- Create: `frontend/src/stores/gamificationStore.ts`
- Create: `frontend/src/stores/settingsStore.ts`
- Create: `frontend/src/stores/__tests__/gamificationStore.test.ts`

**Step 1: Write failing tests for gamification store**

Create `frontend/src/stores/__tests__/gamificationStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useGamificationStore } from '../gamificationStore'

describe('gamificationStore', () => {
  beforeEach(() => {
    useGamificationStore.setState({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: new Date().toISOString().split('T')[0],
      lastWeeklyReset: getWeekStart(),
    })
  })

  it('starts at 0 XP', () => {
    expect(useGamificationStore.getState().xp).toBe(0)
  })

  it('adds XP correctly', () => {
    useGamificationStore.getState().addXP(50)
    expect(useGamificationStore.getState().xp).toBe(50)
  })

  it('tracks earned badges without duplicates', () => {
    const store = useGamificationStore.getState()
    store.unlockBadges(['first_session', 'night_owl'])
    store.unlockBadges(['first_session', 'marathon'])
    expect(useGamificationStore.getState().earnedBadges).toEqual([
      'first_session', 'night_owl', 'marathon'
    ])
  })

  it('increments daily session count', () => {
    useGamificationStore.getState().recordSession()
    expect(useGamificationStore.getState().dailySessionCount).toBe(1)
  })

  it('increments weekly session count', () => {
    useGamificationStore.getState().recordSession()
    expect(useGamificationStore.getState().weeklySessionCount).toBe(1)
  })
})

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(now.setDate(diff)).toISOString().split('T')[0]
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/stores/__tests__/gamificationStore.test.ts`
Expected: FAIL - module not found

**Step 3: Implement gamification store**

Create `frontend/src/stores/gamificationStore.ts`:
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(now).setDate(diff)).toISOString().split('T')[0]
}

interface GamificationState {
  xp: number
  earnedBadges: string[]
  selectedTheme: string
  dailySessionCount: number
  weeklySessionCount: number
  lastDailyReset: string
  lastWeeklyReset: string
  addXP: (amount: number) => void
  unlockBadges: (badgeIds: string[]) => void
  setSelectedTheme: (themeId: string) => void
  recordSession: () => void
  checkResets: () => void
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      xp: 0,
      earnedBadges: [],
      selectedTheme: 'default',
      dailySessionCount: 0,
      weeklySessionCount: 0,
      lastDailyReset: new Date().toISOString().split('T')[0],
      lastWeeklyReset: getWeekStart(),

      addXP: (amount) => {
        set((state) => ({ xp: state.xp + amount }))
      },

      unlockBadges: (badgeIds) => {
        set((state) => {
          const newBadges = badgeIds.filter(id => !state.earnedBadges.includes(id))
          if (newBadges.length === 0) return state
          return { earnedBadges: [...state.earnedBadges, ...newBadges] }
        })
      },

      setSelectedTheme: (themeId) => {
        set({ selectedTheme: themeId })
      },

      recordSession: () => {
        get().checkResets()
        set((state) => ({
          dailySessionCount: state.dailySessionCount + 1,
          weeklySessionCount: state.weeklySessionCount + 1,
        }))
      },

      checkResets: () => {
        const today = new Date().toISOString().split('T')[0]
        const currentWeekStart = getWeekStart()
        const state = get()

        const updates: Partial<GamificationState> = {}
        if (state.lastDailyReset !== today) {
          updates.dailySessionCount = 0
          updates.lastDailyReset = today
        }
        if (state.lastWeeklyReset !== currentWeekStart) {
          updates.weeklySessionCount = 0
          updates.lastWeeklyReset = currentWeekStart
        }
        if (Object.keys(updates).length > 0) {
          set(updates)
        }
      },
    }),
    { name: 'breathwork-gamification' }
  )
)
```

**Step 4: Implement settings store**

Create `frontend/src/stores/settingsStore.ts`:
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark' | 'system'

interface SettingsState {
  theme: ThemeMode
  soundEnabled: boolean
  soundVolume: number
  hapticsEnabled: boolean
  setTheme: (theme: ThemeMode) => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
  setHapticsEnabled: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      soundEnabled: true,
      soundVolume: 0.3,
      hapticsEnabled: true,
      setTheme: (theme) => set({ theme }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setSoundVolume: (volume) => set({ soundVolume: Math.max(0, Math.min(1, volume)) }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
    }),
    { name: 'breathwork-settings' }
  )
)
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/stores/__tests__/gamificationStore.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add frontend/src/stores/gamificationStore.ts frontend/src/stores/settingsStore.ts frontend/src/stores/__tests__/gamificationStore.test.ts
git commit -m "feat(breathwork): add gamification and settings stores"
```

---

### Task 4: Update Theme System + Dark-First CSS

Update the theme hook to use the settings store and make the breathwork app dark-first. Update CSS variables for the new dark-first design.

**Files:**
- Modify: `frontend/src/hooks/useTheme.ts`
- Modify: `frontend/src/index.css` (breathwork CSS variables and new dark-first tokens)

**Step 1: Refactor useTheme to use settingsStore**

Replace `frontend/src/hooks/useTheme.ts` with:
```ts
import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'

export function useTheme() {
  const { theme, setTheme } = useSettingsStore()

  useEffect(() => {
    const root = window.document.documentElement

    const applyTheme = (t: typeof theme) => {
      if (t === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        root.classList.toggle('dark', systemTheme === 'dark')
      } else {
        root.classList.toggle('dark', t === 'dark')
      }
    }

    applyTheme(theme)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') applyTheme('system')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  return { theme, setTheme }
}
```

**Step 2: Update CSS for dark-first breathwork design**

In `frontend/src/index.css`, replace the `.breathwork` and `.dark .breathwork` variable blocks AND the breathwork background/glass sections with the new dark-first design. Update the `.breath-bg` dark variant to be the primary and the light version to be the alternate. Update liquid-glass-breath so dark is the base style:

- Replace `.breathwork { ... }` CSS variables with dark values as the base
- Make `.breathwork` (no .dark prefix) use dark theme tokens
- Add `.light .breathwork` or keep the current light values under a non-dark context
- Update `.breath-bg` so the dark gradient is the default, light gradient is the `.light .breath-bg` override
- Similarly update `.liquid-glass-breath`

Key changes to CSS variables in the `@layer base` section:
```css
/* Breathwork: dark-first */
.breathwork {
  --background: 225 20% 7%;
  --foreground: 220 15% 95%;
  --card: 225 20% 11% / 0.6;
  --card-foreground: 220 15% 95%;
  --popover: 225 20% 11% / 0.9;
  --popover-foreground: 220 15% 95%;
  --primary: 210 100% 65%;
  --primary-foreground: 225 25% 5%;
  --secondary: 220 15% 16% / 0.7;
  --secondary-foreground: 220 15% 90%;
  --muted: 220 12% 16% / 0.8;
  --muted-foreground: 220 10% 55%;
  --accent: 220 15% 18% / 0.8;
  --accent-foreground: 220 15% 95%;
  --destructive: 0 70% 50%;
  --destructive-foreground: 0 0% 100%;
  --border: 220 15% 18% / 0.6;
  --input: 220 15% 14% / 0.8;
  --ring: 210 100% 65% / 0.5;
  --radius: 1rem;
}
```

Update `.breath-bg` so dark is default:
```css
.breath-bg {
  background: linear-gradient(
    135deg,
    #0a0e1a 0%,
    #0f1225 25%,
    #0d1020 50%,
    #080c18 75%,
    #0a0e1a 100%
  );
}
```

Update `.liquid-glass-breath` so dark is default:
```css
.liquid-glass-breath {
  background: linear-gradient(
    135deg,
    rgba(30, 35, 55, 0.6) 0%,
    rgba(40, 35, 60, 0.5) 50%,
    rgba(30, 35, 55, 0.4) 100%
  );
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
```

Also update the decorative orb colors to be more subtle on dark backgrounds.

**Step 3: Verify the app builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/hooks/useTheme.ts frontend/src/index.css
git commit -m "feat(breathwork): dark-first theme with updated CSS tokens"
```

---

### Task 5: FluidOrb Component (Replaces WaveformVisualizer)

The core visual - a CSS-based morphing fluid orb that responds to breathing phases.

**Files:**
- Create: `frontend/src/components/breathing/FluidOrb.tsx`
- Create: `frontend/src/components/breathing/__tests__/FluidOrb.test.tsx`
- Modify: `frontend/src/hooks/useWaveform.ts` (minor: export phase progress for orb)

**Step 1: Write tests for FluidOrb**

Create `frontend/src/components/breathing/__tests__/FluidOrb.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FluidOrb } from '../FluidOrb'
import { BREATH_PHASES } from '@/lib/constants'

describe('FluidOrb', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.2} isActive={false} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with inhale phase', () => {
    const { container } = render(
      <FluidOrb phase={BREATH_PHASES.INHALE} amplitude={0.8} isActive={true} />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('applies technique color override', () => {
    const { container } = render(
      <FluidOrb
        phase={BREATH_PHASES.INHALE}
        amplitude={1}
        isActive={true}
        themeColors={['#ff0000', '#00ff00']}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(
      <FluidOrb phase={null} amplitude={0.2} isActive={false} className="custom-class" />
    )
    expect(container.querySelector('.custom-class')).toBeTruthy()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/breathing/__tests__/FluidOrb.test.tsx`
Expected: FAIL

**Step 3: Implement FluidOrb**

Create `frontend/src/components/breathing/FluidOrb.tsx`:
```tsx
import { useMemo } from 'react'
import { BREATH_PHASES, type BreathPhase } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface FluidOrbProps {
  phase: BreathPhase | null
  amplitude: number // 0-1
  isActive: boolean
  themeColors?: [string, string]
  className?: string
}

const PHASE_COLORS: Record<string, [string, string]> = {
  [BREATH_PHASES.INHALE]: ['#3b82f6', '#06b6d4'],
  [BREATH_PHASES.HOLD_IN]: ['#8b5cf6', '#a855f7'],
  [BREATH_PHASES.EXHALE]: ['#14b8a6', '#10b981'],
  [BREATH_PHASES.HOLD_OUT]: ['#f59e0b', '#f97316'],
  [BREATH_PHASES.REST]: ['#6b7280', '#9ca3af'],
  idle: ['#4b5563', '#6b7280'],
}

export function FluidOrb({
  phase,
  amplitude,
  isActive,
  themeColors,
  className,
}: FluidOrbProps) {
  const colors = themeColors ?? PHASE_COLORS[phase ?? 'idle']

  // Scale orb size based on amplitude (0.6 to 1.0 of container)
  const scale = 0.6 + amplitude * 0.4
  // Blob border-radius morphing for fluid look
  const morphAmount = isActive ? amplitude * 15 : 0
  const borderRadius = useMemo(() => {
    const base = 50
    const r1 = base + morphAmount
    const r2 = base - morphAmount * 0.5
    const r3 = base + morphAmount * 0.7
    const r4 = base - morphAmount * 0.3
    return `${r1}% ${r2}% ${r3}% ${r4}% / ${r2}% ${r3}% ${r4}% ${r1}%`
  }, [morphAmount])

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Outer glow */}
      <div
        className="absolute rounded-full transition-all duration-700 blur-3xl"
        style={{
          width: `${scale * 110}%`,
          height: `${scale * 110}%`,
          maxWidth: '340px',
          maxHeight: '340px',
          background: `radial-gradient(circle, ${colors[0]}40, transparent 70%)`,
          opacity: isActive ? 0.8 : 0.3,
        }}
      />

      {/* Secondary glow ring */}
      <div
        className="absolute rounded-full transition-all duration-1000 blur-xl"
        style={{
          width: `${scale * 90}%`,
          height: `${scale * 90}%`,
          maxWidth: '280px',
          maxHeight: '280px',
          background: `radial-gradient(circle, ${colors[1]}30, transparent 60%)`,
          opacity: isActive ? 0.6 : 0.2,
        }}
      />

      {/* Main orb */}
      <div
        className="relative transition-all ease-out"
        style={{
          width: `${scale * 70}%`,
          height: `${scale * 70}%`,
          maxWidth: '220px',
          maxHeight: '220px',
          borderRadius,
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          boxShadow: `
            0 0 60px ${colors[0]}40,
            0 0 120px ${colors[0]}20,
            inset 0 -20px 40px ${colors[1]}40,
            inset 0 20px 40px rgba(255,255,255,0.15)
          `,
          transitionDuration: isActive ? '800ms' : '1200ms',
        }}
      >
        {/* Specular highlight */}
        <div
          className="absolute top-[15%] left-[20%] rounded-full"
          style={{
            width: '40%',
            height: '25%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4), transparent)',
            filter: 'blur(8px)',
          }}
        />
      </div>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/breathing/__tests__/FluidOrb.test.tsx`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add frontend/src/components/breathing/FluidOrb.tsx frontend/src/components/breathing/__tests__/FluidOrb.test.tsx
git commit -m "feat(breathwork): add FluidOrb component with phase-reactive CSS animations"
```

---

### Task 6: LevelRing Component

Circular SVG progress indicator for level XP and daily goal.

**Files:**
- Create: `frontend/src/components/gamification/LevelRing.tsx`
- Create: `frontend/src/components/gamification/__tests__/LevelRing.test.tsx`

**Step 1: Write tests**

Create `frontend/src/components/gamification/__tests__/LevelRing.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LevelRing } from '../LevelRing'

describe('LevelRing', () => {
  it('renders level number', () => {
    render(<LevelRing level={5} progress={0.5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('renders with zero progress', () => {
    const { container } = render(<LevelRing level={1} progress={0} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with full progress', () => {
    const { container } = render(<LevelRing level={50} progress={1} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('accepts custom size', () => {
    const { container } = render(<LevelRing level={3} progress={0.3} size={120} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('120')
  })
})
```

**Step 2: Implement LevelRing**

Create `frontend/src/components/gamification/LevelRing.tsx`:
```tsx
interface LevelRingProps {
  level: number
  progress: number // 0 to 1
  size?: number
  strokeWidth?: number
  colors?: [string, string]
}

export function LevelRing({
  level,
  progress,
  size = 80,
  strokeWidth = 4,
  colors = ['#3b82f6', '#06b6d4'],
}: LevelRingProps) {
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)))

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-grad-${level}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/10"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-grad-${level})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-foreground">{level}</span>
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/gamification/__tests__/LevelRing.test.tsx`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/components/gamification/LevelRing.tsx frontend/src/components/gamification/__tests__/LevelRing.test.tsx
git commit -m "feat(breathwork): add LevelRing circular progress component"
```

---

### Task 7: BadgeGrid Component

**Files:**
- Create: `frontend/src/components/gamification/BadgeGrid.tsx`
- Create: `frontend/src/components/gamification/__tests__/BadgeGrid.test.tsx`

**Step 1: Write tests**

Create `frontend/src/components/gamification/__tests__/BadgeGrid.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeGrid } from '../BadgeGrid'

describe('BadgeGrid', () => {
  it('renders all non-secret badges', () => {
    const { container } = render(<BadgeGrid earnedBadges={[]} />)
    // Should show non-secret badges (9 non-secret)
    const badges = container.querySelectorAll('[data-badge]')
    expect(badges.length).toBeGreaterThanOrEqual(9)
  })

  it('shows earned badges as unlocked', () => {
    render(<BadgeGrid earnedBadges={['first_session']} />)
    expect(screen.getByText('First Session')).toBeTruthy()
  })

  it('reveals secret badges only when earned', () => {
    render(<BadgeGrid earnedBadges={['night_owl']} />)
    expect(screen.getByText('Night Owl')).toBeTruthy()
  })

  it('shows secret badge placeholder when not earned', () => {
    const { container } = render(<BadgeGrid earnedBadges={[]} />)
    const secretSlots = container.querySelectorAll('[data-secret]')
    expect(secretSlots.length).toBe(3) // 3 secret badges
  })
})
```

**Step 2: Implement BadgeGrid**

Create `frontend/src/components/gamification/BadgeGrid.tsx`:
```tsx
import { BADGES } from '@/lib/gamification'
import { cn } from '@/lib/utils'
import {
  Zap, Flame, Crown, Award, Clock, Star,
  Box, Wind, Moon, Sunrise, Timer, HelpCircle, Lock,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ReactNode> = {
  Zap: <Zap className="h-5 w-5" />,
  Flame: <Flame className="h-5 w-5" />,
  Crown: <Crown className="h-5 w-5" />,
  Award: <Award className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
  Star: <Star className="h-5 w-5" />,
  Box: <Box className="h-5 w-5" />,
  Wind: <Wind className="h-5 w-5" />,
  Moon: <Moon className="h-5 w-5" />,
  Sunrise: <Sunrise className="h-5 w-5" />,
  Timer: <Timer className="h-5 w-5" />,
}

interface BadgeGridProps {
  earnedBadges: string[]
}

export function BadgeGrid({ earnedBadges }: BadgeGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {BADGES.map((badge) => {
        const earned = earnedBadges.includes(badge.id)
        const isSecret = badge.secret

        // Secret badges: show placeholder if not earned
        if (isSecret && !earned) {
          return (
            <div
              key={badge.id}
              data-badge={badge.id}
              data-secret="true"
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5"
            >
              <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-white/20" />
              </div>
              <span className="text-xs text-white/20 text-center">???</span>
            </div>
          )
        }

        return (
          <div
            key={badge.id}
            data-badge={badge.id}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all',
              earned
                ? 'bg-white/10 border-white/15'
                : 'bg-white/5 border-white/5 opacity-40'
            )}
          >
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center',
                earned
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                  : 'bg-white/10 text-white/30'
              )}
            >
              {earned ? ICON_MAP[badge.icon] : <Lock className="h-4 w-4" />}
            </div>
            <span className={cn(
              'text-xs text-center font-medium leading-tight',
              earned ? 'text-foreground' : 'text-white/30'
            )}>
              {badge.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 3: Run tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/gamification/__tests__/BadgeGrid.test.tsx`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/components/gamification/BadgeGrid.tsx frontend/src/components/gamification/__tests__/BadgeGrid.test.tsx
git commit -m "feat(breathwork): add BadgeGrid achievement display component"
```

---

### Task 8: ActivityHeatmap Component

GitHub-style contribution calendar for session activity.

**Files:**
- Create: `frontend/src/components/gamification/ActivityHeatmap.tsx`
- Create: `frontend/src/components/gamification/__tests__/ActivityHeatmap.test.tsx`

**Step 1: Write tests**

Create `frontend/src/components/gamification/__tests__/ActivityHeatmap.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ActivityHeatmap } from '../ActivityHeatmap'

describe('ActivityHeatmap', () => {
  it('renders without sessions', () => {
    const { container } = render(<ActivityHeatmap sessions={[]} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders cells for the last 12 weeks', () => {
    const { container } = render(<ActivityHeatmap sessions={[]} />)
    const cells = container.querySelectorAll('[data-cell]')
    // 12 weeks × 7 days = 84 cells
    expect(cells.length).toBe(84)
  })

  it('highlights days with sessions', () => {
    const today = new Date().toISOString()
    const { container } = render(
      <ActivityHeatmap sessions={[{ date: today, count: 1 }]} />
    )
    const activeCells = container.querySelectorAll('[data-active="true"]')
    expect(activeCells.length).toBeGreaterThanOrEqual(1)
  })
})
```

**Step 2: Implement ActivityHeatmap**

Create `frontend/src/components/gamification/ActivityHeatmap.tsx`:
```tsx
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface SessionDay {
  date: string // ISO string
  count: number
}

interface ActivityHeatmapProps {
  sessions: SessionDay[]
}

export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const { cells, months } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const totalDays = 84 // 12 weeks
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - totalDays + 1)
    // Align to start of week (Monday)
    const dayOfWeek = startDate.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startDate.setDate(startDate.getDate() + mondayOffset)

    // Build session count map
    const countMap = new Map<string, number>()
    for (const s of sessions) {
      const key = s.date.split('T')[0]
      countMap.set(key, (countMap.get(key) ?? 0) + s.count)
    }

    const cells: { date: string; count: number; col: number; row: number }[] = []
    const monthLabels: { label: string; col: number }[] = []
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      const col = Math.floor(i / 7)
      const row = i % 7

      if (d.getMonth() !== lastMonth) {
        monthLabels.push({
          label: d.toLocaleDateString('en', { month: 'short' }),
          col,
        })
        lastMonth = d.getMonth()
      }

      cells.push({
        date: key,
        count: countMap.get(key) ?? 0,
        col,
        row,
      })
    }

    return { cells, months: monthLabels }
  }, [sessions])

  const getIntensity = (count: number): string => {
    if (count === 0) return 'bg-white/5'
    if (count === 1) return 'bg-emerald-500/30'
    if (count === 2) return 'bg-emerald-500/50'
    return 'bg-emerald-500/80'
  }

  return (
    <div className="space-y-2">
      {/* Month labels */}
      <div className="flex gap-0 ml-0 text-[10px] text-muted-foreground">
        {months.map((m, i) => (
          <span
            key={i}
            className="flex-shrink-0"
            style={{ marginLeft: i === 0 ? 0 : `${(m.col - (months[i - 1]?.col ?? 0) - 1) * 16}px` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      {/* Grid */}
      <div className="flex gap-[3px]">
        {Array.from({ length: 12 }, (_, col) => (
          <div key={col} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, row) => {
              const cell = cells.find(c => c.col === col && c.row === row)
              return (
                <div
                  key={row}
                  data-cell
                  data-active={cell && cell.count > 0 ? 'true' : 'false'}
                  className={cn(
                    'w-3 h-3 rounded-[3px] transition-colors',
                    cell ? getIntensity(cell.count) : 'bg-white/5'
                  )}
                  title={cell ? `${cell.date}: ${cell.count} session${cell.count !== 1 ? 's' : ''}` : ''}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/gamification/__tests__/ActivityHeatmap.test.tsx`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/components/gamification/ActivityHeatmap.tsx frontend/src/components/gamification/__tests__/ActivityHeatmap.test.tsx
git commit -m "feat(breathwork): add ActivityHeatmap contribution calendar"
```

---

### Task 9: SessionSummary Overlay Component

Post-session animated overlay showing XP earned, badges, and stats.

**Files:**
- Create: `frontend/src/components/breathing/SessionSummary.tsx`
- Create: `frontend/src/components/breathing/__tests__/SessionSummary.test.tsx`

**Step 1: Write tests**

Create `frontend/src/components/breathing/__tests__/SessionSummary.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionSummary } from '../SessionSummary'

describe('SessionSummary', () => {
  const baseProps = {
    xpEarned: 75,
    newBadges: [],
    rounds: 4,
    durationSeconds: 240,
    holdTimes: [15, 20, 18, 22],
    isNewPersonalBest: false,
    onClose: () => {},
  }

  it('displays XP earned', () => {
    render(<SessionSummary {...baseProps} />)
    expect(screen.getByText('+75 XP')).toBeTruthy()
  })

  it('displays round count', () => {
    render(<SessionSummary {...baseProps} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('shows personal best indicator', () => {
    render(<SessionSummary {...baseProps} isNewPersonalBest={true} />)
    expect(screen.getByText(/personal best/i)).toBeTruthy()
  })

  it('shows new badges', () => {
    render(<SessionSummary {...baseProps} newBadges={['first_session']} />)
    expect(screen.getByText('First Session')).toBeTruthy()
  })

  it('shows hold stats when available', () => {
    render(<SessionSummary {...baseProps} />)
    expect(screen.getByText('22s')).toBeTruthy() // best hold
  })
})
```

**Step 2: Implement SessionSummary**

Create `frontend/src/components/breathing/SessionSummary.tsx`:
```tsx
import { BADGES } from '@/lib/gamification'
import { formatTime } from '@/lib/utils'
import { Trophy, Zap, Target, Clock, Star, X } from 'lucide-react'

interface SessionSummaryProps {
  xpEarned: number
  newBadges: string[]
  rounds: number
  durationSeconds: number
  holdTimes: number[]
  isNewPersonalBest: boolean
  onClose: () => void
}

export function SessionSummary({
  xpEarned,
  newBadges,
  rounds,
  durationSeconds,
  holdTimes,
  isNewPersonalBest,
  onClose,
}: SessionSummaryProps) {
  const maxHold = holdTimes.length > 0 ? Math.max(...holdTimes) : 0
  const avgHold = holdTimes.length > 0
    ? Math.round(holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length)
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#1a1e30] to-[#0f1220] border border-white/10 shadow-2xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-4 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Session Complete</h2>

          {/* XP Badge */}
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/30">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-blue-300 font-bold">+{xpEarned} XP</span>
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <Target className="h-5 w-5 mx-auto mb-1 text-white/40" />
              <div className="text-xl font-bold text-white">{rounds}</div>
              <div className="text-xs text-white/40">Rounds</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-white/40" />
              <div className="text-xl font-bold text-white">{formatTime(durationSeconds)}</div>
              <div className="text-xs text-white/40">Duration</div>
            </div>
          </div>

          {holdTimes.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xl font-bold text-amber-400">{maxHold}s</div>
                <div className="text-xs text-white/40">Best Hold</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xl font-bold text-white">{avgHold}s</div>
                <div className="text-xs text-white/40">Avg Hold</div>
              </div>
            </div>
          )}

          {/* Personal Best */}
          {isNewPersonalBest && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/20 text-center">
              <div className="flex items-center justify-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">New Personal Best!</span>
                <Star className="h-4 w-4 text-amber-400" />
              </div>
            </div>
          )}

          {/* New Badges */}
          {newBadges.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-white/40 text-center font-medium uppercase tracking-wider">
                Badges Unlocked
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {newBadges.map((badgeId) => {
                  const badge = BADGES.find(b => b.id === badgeId)
                  if (!badge) return null
                  return (
                    <div
                      key={badgeId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30"
                    >
                      <span className="text-xs font-medium text-amber-300">{badge.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run src/components/breathing/__tests__/SessionSummary.test.tsx`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/components/breathing/SessionSummary.tsx frontend/src/components/breathing/__tests__/SessionSummary.test.tsx
git commit -m "feat(breathwork): add SessionSummary overlay with XP and badge display"
```

---

### Task 10: Redesign Dashboard (Home Page)

Complete rewrite of the Home page with dark-first design, level ring, streak, daily goal, and technique cards.

**Files:**
- Modify: `frontend/src/pages/Home.tsx` (complete rewrite)

**Step 1: Rewrite Home.tsx**

Replace entire `frontend/src/pages/Home.tsx` with new dashboard implementing:
- Level ring + streak fire counter + daily goal ring in a top hero section
- Level title and XP progress bar
- 3 technique cards with technique gradient accents, mini description, "Start" CTA
- Quick stats row: total sessions, total minutes, current streak
- Recent sessions preview (last 3)
- All using the dark design tokens (liquid-glass-breath, muted-foreground, etc.)
- Wire up `useGamificationStore` for level/XP display
- Wire up `useHistoryStore` for sessions/stats
- Navigation to `/breathwork/session?technique=<id>`

Key patterns to follow:
- Import `getLevelForXP`, `getXPForLevel`, `getLevelTitle` from `@/lib/gamification`
- Import `LevelRing` from `@/components/gamification/LevelRing`
- Use `useGamificationStore` for xp, dailySessionCount
- Compute level, progress within level from XP

**Step 2: Verify the app builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat(breathwork): redesign dashboard with level ring, dark theme, and gamification"
```

---

### Task 11: Redesign Session Page (Immersive Breathing)

Rewrite the session page for immersive full-screen dark experience with FluidOrb.

**Files:**
- Modify: `frontend/src/pages/Session.tsx` (complete rewrite)
- Modify: `frontend/src/components/breathing/BreathingSession.tsx` (rewrite to use FluidOrb + SessionSummary)
- Delete or deprecate: `frontend/src/components/breathing/WaveformVisualizer.tsx` (no longer used)

**Step 1: Rewrite BreathingSession.tsx**

Replace with new implementation:
- FluidOrb centered in viewport
- Phase text above orb (large, glowing text)
- Timer below orb (large monospace)
- Thin gradient progress bar at top
- Controls fade to 20% opacity after 3 seconds of no interaction, show on hover/tap
- On complete: calculate XP, check badges, show SessionSummary overlay
- Wire up `useGamificationStore` for XP/badge recording
- Use `useSettingsStore` for sound/haptics preferences
- Keep existing `useBreathingCycle` hook connection

**Step 2: Rewrite Session.tsx**

The session setup page:
- Dark themed technique selection (3 cards, not tabs)
- Round counter with +/-
- Estimated duration
- Big "Begin" button
- On start: render BreathingSession fullscreen

**Step 3: Verify builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/pages/Session.tsx frontend/src/components/breathing/BreathingSession.tsx
git commit -m "feat(breathwork): immersive session experience with FluidOrb and gamification"
```

---

### Task 12: Redesign Progress Page

Rewrite the progress page with badge grid, activity heatmap, and level display.

**Files:**
- Modify: `frontend/src/pages/Progress.tsx` (complete rewrite)
- Modify: `frontend/src/components/tracking/ProgressChart.tsx` (update styling for dark theme)
- Modify: `frontend/src/components/tracking/SessionHistory.tsx` (update styling)
- Modify: `frontend/src/components/tracking/PersonalBests.tsx` (update styling)
- Remove: `frontend/src/components/tracking/AppleHealthCard.tsx` (replaced by gamification)

**Step 1: Rewrite Progress.tsx**

New layout:
- Level card: level ring, title, XP bar, "XP to next level"
- Badge grid section with heading
- Activity heatmap
- Personal bests (updated styling)
- Progress chart (updated styling)
- Session history with filter tabs
- Clear history button with confirmation dialog

**Step 2: Update tracking components for dark theme**

Update ProgressChart, SessionHistory, PersonalBests to use dark-themed styling matching the new design tokens.

**Step 3: Verify builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/pages/Progress.tsx frontend/src/components/tracking/ProgressChart.tsx frontend/src/components/tracking/SessionHistory.tsx frontend/src/components/tracking/PersonalBests.tsx
git commit -m "feat(breathwork): redesign progress page with badges, heatmap, and dark theme"
```

---

### Task 13: Settings Page

**Files:**
- Create: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/main.tsx` (add settings route)

**Step 1: Create Settings page**

Create `frontend/src/pages/Settings.tsx`:
- Theme selector: 3 option cards (Light/Dark/System) using `useSettingsStore`
- Sound toggle + volume slider
- Haptics toggle
- Orb Theme picker: grid of theme color swatches, locked ones grayed with lock icon and level requirement
- Data section: Export as JSON button, Clear History with confirmation
- Wire up `useGamificationStore` for orb theme unlocks
- Wire up `useSettingsStore` for all settings

**Step 2: Add settings route to main.tsx**

In `frontend/src/main.tsx`:
- Add lazy import for Settings page
- Add route: `<Route path="settings" element={...}>`

**Step 3: Update navigation**

In `frontend/src/components/layout/Header.tsx` and `frontend/src/components/layout/Navigation.tsx`:
- Add Settings link (gear icon) to both header and bottom nav
- Update to 4-tab navigation: Home, Session, Progress, Settings

**Step 4: Verify builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/pages/Settings.tsx frontend/src/main.tsx frontend/src/components/layout/Header.tsx frontend/src/components/layout/Navigation.tsx
git commit -m "feat(breathwork): add settings page with theme, sound, haptics, and orb theme selection"
```

---

### Task 14: Update Layout for Dark-First Design

**Files:**
- Modify: `frontend/src/components/layout/BreathworkLayout.tsx`
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/layout/Navigation.tsx`

**Step 1: Update BreathworkLayout**

- Remove warm-toned decorative orbs, replace with subtle dark-themed background
- Keep the `.breath-bg` class (now dark by default)
- Simplify decorative elements to 2 subtle gradient blobs
- Ensure dark class is applied to html when breathwork layout mounts

**Step 2: Update Header**

- Dark-themed header with subtle glass effect
- Update active link styling for dark theme
- Thinner, more minimal design
- 4 links: Home, Session, Progress, Settings

**Step 3: Update Navigation**

- Dark-themed bottom navigation
- 4 tabs matching header
- Subtle active indicator (gradient underline or glow)
- Settings icon (gear)

**Step 4: Verify builds**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/layout/BreathworkLayout.tsx frontend/src/components/layout/Header.tsx frontend/src/components/layout/Navigation.tsx
git commit -m "feat(breathwork): update layout and navigation for dark-first design"
```

---

### Task 15: Wire Up Gamification on Session Complete

Connect the session completion to the gamification system.

**Files:**
- Modify: `frontend/src/hooks/useBreathingCycle.ts` (add gamification on complete)

**Step 1: Update useBreathingCycle**

In the session completion block (around line 160-184), after `addSession(...)`:
- Import and call `calculateXP` with technique, rounds, streak
- Import and call `checkBadgeUnlocks` with aggregated stats from historyStore
- Call `useGamificationStore.getState().addXP(xpAmount)`
- Call `useGamificationStore.getState().unlockBadges(newBadges)`
- Call `useGamificationStore.getState().recordSession()`

This ensures gamification state updates happen atomically with session recording.

**Step 2: Run all tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add frontend/src/hooks/useBreathingCycle.ts
git commit -m "feat(breathwork): wire gamification XP and badges to session completion"
```

---

### Task 16: Clean Up Unused Files and Final Polish

**Files:**
- Delete: `frontend/src/components/breathing/WaveformVisualizer.tsx` (replaced by FluidOrb)
- Delete: `frontend/src/components/tracking/AppleHealthCard.tsx` (removed from progress page)
- Modify: `frontend/src/hooks/useWaveform.ts` (verify still used by FluidOrb or clean up)

**Step 1: Remove unused files**

Delete WaveformVisualizer.tsx and AppleHealthCard.tsx.

**Step 2: Verify no broken imports**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run build`
Expected: Build succeeds with no errors

**Step 3: Run all tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run`
Expected: All tests pass

**Step 4: Manual smoke test checklist**

- [ ] Dashboard loads with level ring, streak, technique cards
- [ ] Clicking technique navigates to session setup
- [ ] Session setup allows round selection and shows duration
- [ ] Starting session shows immersive FluidOrb view
- [ ] Breathing phases transition correctly with audio
- [ ] Session completion shows XP earned and badges
- [ ] Progress page shows badge grid, heatmap, charts
- [ ] Settings page allows theme/sound/haptics/orb theme changes
- [ ] Dark theme is default, light theme works via settings
- [ ] Mobile responsive (bottom nav, touch targets)

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(breathwork): clean up unused files and finalize redesign"
```

---

### Task 17: Integration Test for Full Session Flow

**Files:**
- Create: `frontend/src/lib/__tests__/breathingProtocols.test.ts`
- Create: `frontend/src/__tests__/sessionFlow.test.ts`

**Step 1: Write breathing protocol tests**

Create `frontend/src/lib/__tests__/breathingProtocols.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  calculateSessionDuration,
  getPhaseForRound,
  getProtocol,
} from '../breathingProtocols'
import { TECHNIQUE_IDS, BREATH_PHASES } from '../constants'

describe('calculateSessionDuration', () => {
  it('calculates box breathing duration correctly', () => {
    // 4 phases × 4 seconds × 4 rounds = 64
    expect(calculateSessionDuration({
      techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
      rounds: 4,
    })).toBe(64)
  })

  it('calculates CO2 tolerance with progressive holds', () => {
    const duration = calculateSessionDuration({
      techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
      rounds: 8,
    })
    // Round 0: 3+15+3+10=31, Round 1: 3+20+3+10=36, ..., Round 7: 3+50+3+10=66
    // Total: 31+36+41+46+51+56+61+66 = 388
    expect(duration).toBe(388)
  })
})

describe('getPhaseForRound', () => {
  it('returns progressive hold for CO2 tolerance', () => {
    const protocol = getProtocol(TECHNIQUE_IDS.CO2_TOLERANCE)
    const phase = getPhaseForRound(protocol, 3, 1) // Round 3, hold phase
    expect(phase.phase).toBe(BREATH_PHASES.HOLD_IN)
    expect(phase.duration).toBe(30) // 15 + 3*5
  })
})
```

**Step 2: Run all tests**

Run: `cd /Users/anthony.lim/Projects/anthonyl.im/frontend && bun run test:run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/breathingProtocols.test.ts
git commit -m "test(breathwork): add breathing protocol and integration tests"
```
