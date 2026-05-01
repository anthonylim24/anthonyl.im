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

describe('Settings accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings.theme = 'light'
    mocks.settings.soundEnabled = true
    mocks.settings.soundVolume = 0.5
    mocks.settings.hapticsEnabled = true
  })

  it('uses 44px minimum hit areas for theme and feedback controls', () => {
    render(<Settings />)

    expect(screen.getByRole('button', { name: /dark/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: /light/i })).toHaveClass('min-h-11')

    expect(screen.getByRole('switch', { name: /sound/i })).toHaveClass('h-11', 'w-14')
    expect(screen.getByRole('switch', { name: /haptics/i })).toHaveClass('h-11', 'w-14')
  })
})
