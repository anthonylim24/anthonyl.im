import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathingSession } from '../BreathingSession'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import type { SessionConfig } from '@/lib/breathingProtocols'

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
    waveformOptions: undefined as { phaseDuration?: number } | undefined,
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
  useWaveform: (options: { phaseDuration?: number }) => {
    mocks.waveformOptions = options
    return { amplitude: 0.25 }
  },
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

function renderSession(props?: {
  config?: SessionConfig
  onCancel?: () => void
}) {
  return render(
    <BreathingSession
      config={props?.config ?? { techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }}
      onCancel={props?.onCancel}
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
    mocks.waveformOptions = undefined
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

  it('uses custom phase duration for waveform timing', () => {
    renderSession({
      config: {
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        rounds: 4,
        customPhaseDurations: {
          [BREATH_PHASES.INHALE]: 6,
        },
      },
    })

    expect(mocks.waveformOptions).toMatchObject({
      phaseDuration: 6,
    })
  })

  it('announces active phase and round progress without relying on the countdown text', () => {
    renderSession()

    expect(screen.getByTestId('session-live-region')).toHaveTextContent(
      'Round 1 of 4. Breathe In phase. Trace the first side of the box with a measured inhale.'
    )
    expect(screen.getByTestId('phase-coach-cue')).toHaveTextContent(
      'Trace the first side of the box with a measured inhale.'
    )
  })

  it('announces paused session context', () => {
    mocks.cycle.isPaused = true
    mocks.cycle.session.isPaused = true
    mocks.cycle.session.currentRound = 1
    mocks.cycle.session.currentPhase = BREATH_PHASES.EXHALE

    renderSession()

    expect(screen.getByTestId('session-live-region')).toHaveTextContent(
      'Box Breathing paused. Round 2 of 4. Breathe Out phase. Trace the next side with an even exhale.'
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

  it('lets keyboard users pause an active session with Space', () => {
    renderSession()

    fireEvent.keyDown(window, { key: ' ' })

    expect(mocks.cycle.pause).toHaveBeenCalledTimes(1)
    expect(mocks.haptic).toHaveBeenCalledWith(40)
  })

  it('does not override native Space handling on focused controls', () => {
    renderSession()

    const pauseButton = screen.getByRole('button', { name: 'Pause' })
    pauseButton.focus()
    fireEvent.keyDown(pauseButton, { key: ' ' })

    expect(mocks.cycle.pause).not.toHaveBeenCalled()
  })

  it('lets keyboard users stop an active session with Escape', () => {
    const onCancel = vi.fn()
    renderSession({ onCancel })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(mocks.cycle.stop).toHaveBeenCalledTimes(1)
    expect(mocks.haptic).toHaveBeenCalledWith('error')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
