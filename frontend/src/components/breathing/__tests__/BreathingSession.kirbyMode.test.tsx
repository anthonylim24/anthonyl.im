import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { TECHNIQUE_IDS } from '@/lib/constants'
import { BreathingSession } from '../BreathingSession'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))
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
    selectedTheme: 'default',
    xp: 0,
  }),
}))
vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: [],
    getStreak: () => 0,
  }),
}))
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    soundEnabled: true,
    soundVolume: 0.3,
    setSoundEnabled: vi.fn(),
  }),
}))

// Use a non-box technique here so the visualization is the orb (concentric-rings
// testid), not the box. The Kirby easter egg works the same for both, but the
// orb-tap test fixtures predate BoxVisualization.
const CONFIG = { techniqueId: TECHNIQUE_IDS.CYCLIC_SIGHING, rounds: 4 }

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BreathingSession Kirby mode', () => {
  it('does not show Kirby mode initially', () => {
    render(<BreathingSession config={CONFIG} />)

    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
    expect(screen.queryByTestId('kirby-orb')).toBeNull()
  })

  it('shows Kirby mode after 5 rapid taps on the orb', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }

    expect(screen.getByTestId('kirby-easter-egg')).toBeInTheDocument()
    expect(screen.getByTestId('kirby-orb')).toBeInTheDocument()
  })

  it('shows Kirby mode after 5 keyboard activations on the orb', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByRole('button', { name: /Breathe In phase/i })
    orb.focus()
    for (let i = 0; i < 5; i++) {
      await userEvent.keyboard('{Enter}')
    }

    expect(screen.getByTestId('kirby-easter-egg')).toBeInTheDocument()
    expect(screen.getByTestId('kirby-orb')).toBeInTheDocument()
  })

  it('hides Kirby mode after a second set of 5 rapid taps', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByTestId('concentric-rings')

    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeInTheDocument()

    const kirbyOrb = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(kirbyOrb)
    }

    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
    expect(screen.queryByTestId('kirby-orb')).toBeNull()
  })

  it('does not enable Kirby mode when reduced motion is requested', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    expect(screen.queryByRole('button', { name: /toggle alternate visual/i })).toBeNull()
    expect(screen.getByRole('img', { name: /breathing visualization/i })).toBeInTheDocument()

    const orb = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }

    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
    expect(screen.queryByTestId('kirby-orb')).toBeNull()
  })

  it('hides Kirby mode while reduced motion is active mid-session', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    const { rerender } = render(<BreathingSession config={CONFIG} />)
    const orb = screen.getByTestId('concentric-rings')

    for (let i = 0; i < 5; i++) {
      await userEvent.click(orb)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeInTheDocument()

    vi.mocked(useReducedMotion).mockReturnValue(true)
    rerender(<BreathingSession config={CONFIG} />)

    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
    expect(screen.queryByTestId('kirby-orb')).toBeNull()
    expect(screen.queryByRole('button', { name: /toggle alternate visual/i })).toBeNull()
    expect(screen.getByRole('img', { name: /breathing visualization/i })).toBeInTheDocument()
  })
})
