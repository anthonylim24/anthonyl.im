import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

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

  it('shows KirbyEasterEgg after 5 rapid taps on rings', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()
  })

  it('hides KirbyEasterEgg after a second set of 5 rapid taps', async () => {
    let t = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 100))

    render(<BreathingSession config={CONFIG} />)
    const rings = screen.getByTestId('concentric-rings')

    for (let i = 0; i < 5; i++) {
      await userEvent.click(rings)
    }
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()

    // In kirby mode, the click target changes but still has same testid
    const kirbyTarget = screen.getByTestId('concentric-rings')
    for (let i = 0; i < 5; i++) {
      await userEvent.click(kirbyTarget)
    }
    expect(screen.queryByTestId('kirby-easter-egg')).toBeNull()
  })
})
