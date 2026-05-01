import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathingSession } from '../BreathingSession'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'

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
    cycleOptions: undefined as { enableAudio?: boolean; audioVolume?: number } | undefined,
    reducedMotion: false,
    haptic: vi.fn(),
    settings: {
      soundEnabled: true,
      soundVolume: 0.3,
    },
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
  useBreathingCycle: (options: { enableAudio?: boolean; audioVolume?: number }) => {
    mocks.cycleOptions = options
    return mocks.cycle
  },
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
  useSettingsStore: () => mocks.settings,
}))

function renderSession() {
  return render(
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
    mocks.cycleOptions = undefined
    mocks.reducedMotion = false
    mocks.settings.soundEnabled = true
    mocks.settings.soundVolume = 0.3
    mocks.cycle.isActive = true
    mocks.cycle.isPaused = false
    mocks.cycle.isComplete = false
    mocks.cycle.session.currentRound = 0
    mocks.cycle.session.currentPhaseIndex = 0
    mocks.cycle.session.currentPhase = BREATH_PHASES.INHALE
    mocks.cycle.session.timeRemaining = 4
    mocks.cycle.session.isPaused = false
    mocks.cycle.session.isComplete = false
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

  it('passes sound settings into the breathing cycle', () => {
    mocks.settings.soundEnabled = false
    mocks.settings.soundVolume = 0.42

    renderSession()

    expect(mocks.cycleOptions).toMatchObject({
      enableAudio: false,
      audioVolume: 0.42,
    })
  })

  it('announces active phase and round progress without relying on the countdown text', () => {
    renderSession()

    expect(screen.getByTestId('session-live-region')).toHaveTextContent(
      'Round 1 of 4. Breathe In phase.'
    )
  })

  it('announces paused session context', () => {
    mocks.cycle.isPaused = true
    mocks.cycle.session.isPaused = true
    mocks.cycle.session.currentRound = 1
    mocks.cycle.session.currentPhase = BREATH_PHASES.EXHALE

    renderSession()

    expect(screen.getByTestId('session-live-region')).toHaveTextContent(
      'Box Breathing paused. Round 2 of 4. Breathe Out phase.'
    )
  })

  it('announces completion when the breathing cycle completes', () => {
    mocks.cycle.isComplete = true
    mocks.cycle.session.isComplete = true

    renderSession()

    expect(screen.getByTestId('session-live-region')).toHaveTextContent(
      'Box Breathing complete. Review your session summary.'
    )
  })
})
