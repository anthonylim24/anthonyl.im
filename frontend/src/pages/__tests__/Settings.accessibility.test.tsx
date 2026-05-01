import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Settings } from '../Settings'

const mocks = vi.hoisted(() => ({
  haptic: vi.fn(),
  clearHistory: vi.fn(),
  settings: {
    theme: 'light' as 'light' | 'dark',
    setTheme: vi.fn(),
    soundEnabled: true,
    setSoundEnabled: vi.fn(),
    soundVolume: 0.5,
    setSoundVolume: vi.fn(),
    hapticsEnabled: true,
    setHapticsEnabled: vi.fn(),
  },
  gamification: {
    xp: 0,
    selectedTheme: 'default',
    setSelectedTheme: vi.fn(),
  },
}))

vi.mock('@/lib/clerk', () => ({
  CLERK_ENABLED: false,
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({ clearHistory: mocks.clearHistory }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => mocks.settings,
}))

vi.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: () => mocks.gamification,
}))

describe('Settings accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings.theme = 'light'
    mocks.settings.soundEnabled = true
    mocks.settings.soundVolume = 0.5
    mocks.settings.hapticsEnabled = true
    mocks.gamification.xp = 0
    mocks.gamification.selectedTheme = 'default'
  })

  it('uses 44px minimum hit areas for theme and feedback controls', () => {
    render(<Settings />)

    expect(screen.getByRole('button', { name: /dark/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: /light/i })).toHaveClass('min-h-11')

    expect(screen.getByRole('switch', { name: /sound/i })).toHaveClass('h-11', 'w-14')
    expect(screen.getByRole('switch', { name: /haptics/i })).toHaveClass('h-11', 'w-14')
  })

  it('shows unlocked and locked orb palette controls with clear states', () => {
    render(<Settings />)

    const defaultPalette = screen.getByRole('button', { name: /default orb palette/i })
    const tidalPalette = screen.getByRole('button', { name: /tidal orb palette/i })

    expect(defaultPalette).toHaveAttribute('aria-pressed', 'true')
    expect(defaultPalette).toHaveClass('min-h-24')
    expect(tidalPalette).toBeDisabled()
    expect(tidalPalette).toHaveAccessibleName(/unlocks at level 5/i)
  })
})
