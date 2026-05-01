import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Settings } from '../Settings'
import { STORAGE_KEYS } from '@/lib/constants'

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
    resetSettings: vi.fn(),
  },
  gamification: {
    xp: 0,
    selectedTheme: 'default',
    setSelectedTheme: vi.fn(),
    resetProgress: vi.fn(),
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
  const storageValues = new Map<string, string>()

  beforeEach(() => {
    vi.clearAllMocks()
    storageValues.clear()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageValues.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        storageValues.delete(key)
      }),
    })
    mocks.settings.theme = 'light'
    mocks.settings.soundEnabled = true
    mocks.settings.soundVolume = 0.5
    mocks.settings.hapticsEnabled = true
    mocks.gamification.xp = 0
    mocks.gamification.selectedTheme = 'default'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses 44px minimum hit areas for theme and feedback controls', () => {
    render(<Settings />)

    expect(screen.getByRole('button', { name: /dark/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: /light/i })).toHaveClass('min-h-11')

    expect(screen.getByRole('switch', { name: /sound/i })).toHaveClass('h-11', 'w-14')
    expect(screen.getByRole('switch', { name: /haptics/i })).toHaveClass('h-11', 'w-14')
    expect(screen.getByRole('slider', { name: /sound volume/i })).toHaveClass('h-11')
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

  it('requires confirmation before clearing all BreathFlow-owned data', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEYS.SESSION_HISTORY, 'history')
    localStorage.setItem(STORAGE_KEYS.GAMIFICATION, 'progress')
    localStorage.setItem(STORAGE_KEYS.SETTINGS, 'settings')
    localStorage.setItem('unrelated-app-key', 'keep')

    render(<Settings />)

    await user.click(screen.getByRole('button', { name: /clear all data/i }))

    expect(mocks.clearHistory).not.toHaveBeenCalled()
    expect(mocks.gamification.resetProgress).not.toHaveBeenCalled()
    expect(mocks.settings.resetSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /tap again to confirm/i }))

    expect(mocks.clearHistory).toHaveBeenCalledTimes(1)
    expect(mocks.gamification.resetProgress).toHaveBeenCalledTimes(1)
    expect(mocks.settings.resetSettings).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEYS.SESSION_HISTORY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.GAMIFICATION)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toBeNull()
    expect(localStorage.getItem('unrelated-app-key')).toBe('keep')
  })
})
