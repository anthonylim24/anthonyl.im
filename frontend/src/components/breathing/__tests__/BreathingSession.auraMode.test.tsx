import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

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

const CONFIG = { techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BreathingSession aura mode', () => {
  it('does not show the aura field initially', () => {
    render(<BreathingSession config={CONFIG} />)
    expect(screen.queryByTestId('breath-aura-field')).toBeNull()
  })

  it('shows the aura field after 5 rapid taps on rings', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }
    expect(screen.getByTestId('breath-aura-field')).toBeTruthy()
  })

  it('shows the aura field after 5 keyboard activations on rings', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByRole('button', { name: /Breathe In phase/i })
    rings.focus()
    for (let i = 0; i < 5; i++) {
      await userEvent.keyboard('{Enter}')
    }
    expect(screen.getByTestId('breath-aura-field')).toBeTruthy()
  })

  it('hides the aura field after a second set of 5 rapid taps', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByTestId('concentric-rings')

    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }
    expect(screen.getByTestId('breath-aura-field')).toBeTruthy()

    const auraTarget = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(auraTarget)
    }
    expect(screen.queryByTestId('breath-aura-field')).toBeNull()
  })

  it('does not enable aura mode when reduced motion is requested', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    expect(screen.queryByRole('button', { name: /toggle alternate visual/i })).toBeNull()
    expect(screen.getByRole('img', { name: /breathing visualization/i })).toBeInTheDocument()

    const rings = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }

    expect(screen.queryByTestId('breath-aura-field')).toBeNull()
  })

  it('hides aura controls while reduced motion is active mid-session', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    const { rerender } = render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByTestId('concentric-rings')

    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }
    expect(screen.getByTestId('breath-aura-field')).toBeTruthy()

    vi.mocked(useReducedMotion).mockReturnValue(true)
    rerender(<BreathingSession config={CONFIG} />)

    expect(screen.queryByTestId('breath-aura-field')).toBeNull()
    expect(screen.queryByRole('button', { name: /toggle alternate visual/i })).toBeNull()
    expect(screen.getByRole('img', { name: /breathing visualization/i })).toBeInTheDocument()
  })
})
