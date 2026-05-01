import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

const mocks = vi.hoisted(() => {
  const cycle = {
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
    isActive: true,
    isPaused: false,
    isComplete: false,
  }

  return {
    cycle,
    reducedMotion: false,
    haptic: vi.fn(),
  }
})

vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 18 }),
}))

vi.mock('@/hooks/useWaveform', () => ({
  useWaveform: () => ({ amplitude: 0.25 }),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/hooks/useWakeLock', () => ({
  useWakeLock: vi.fn(),
}))

vi.mock('@/hooks/useBreathingCycle', () => ({
  useBreathingCycle: () => mocks.cycle,
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

function renderSession() {
  render(
    <BreathingSession
      config={{ techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }}
    />
  )
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('BreathingSession controls accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.reducedMotion = false
    mocks.cycle.isActive = true
    mocks.cycle.isPaused = false
    mocks.cycle.isComplete = false
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('keeps auto-hidden controls fully visible while keyboard focus is inside the toolbar', async () => {
    renderSession()

    const controls = screen.getByTestId('session-controls')
    const pauseButton = screen.getByRole('button', { name: 'Pause' })

    await advance(3500)
    expect(controls).toHaveClass('opacity-20')

    fireEvent.focus(pauseButton)
    expect(controls).toHaveClass('opacity-100')
    expect(controls).not.toHaveClass('opacity-20')

    await advance(5000)
    expect(controls).toHaveClass('opacity-100')
    expect(controls).not.toHaveClass('opacity-20')

    fireEvent.blur(pauseButton, { relatedTarget: document.body })
    await advance(3500)
    expect(controls).toHaveClass('opacity-20')
  })

  it('does not auto-hide controls for reduced-motion users', async () => {
    mocks.reducedMotion = true

    renderSession()

    const controls = screen.getByTestId('session-controls')

    await advance(10000)
    expect(controls).toHaveClass('opacity-100')
    expect(controls).not.toHaveClass('opacity-20')
  })
})
