import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BreathingSession } from '../BreathingSession'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import { calculateSessionDuration, type SessionConfig } from '@/lib/breathingProtocols'
import type { CompletedSession } from '@/stores/historyStore'

const sessionConfig: SessionConfig = {
  techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
  rounds: 1,
}
const startTime = new Date('2026-05-01T10:00:00.000Z')
const durationSeconds = calculateSessionDuration(sessionConfig)

const mocks = vi.hoisted(() => {
  const cycle = {
    session: {
      config: {
        techniqueId: 'co2_tolerance',
        rounds: 1,
      },
      startTime: new Date('2026-05-01T10:00:00.000Z'),
      currentRound: 1,
      currentPhaseIndex: 1,
      currentPhase: 'hold_in',
      timeRemaining: 0,
      isPaused: false,
      isComplete: true,
      holdTimes: [45],
    },
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    isActive: false,
    isPaused: false,
    isComplete: true,
  }

  return {
    addXP: vi.fn(),
    haptic: vi.fn(),
    recordSession: vi.fn(),
    unlockBadges: vi.fn(),
    cycle,
    cycleOptions: undefined as undefined | { onSessionComplete?: () => void },
    earnedBadges: ['first_session', 'box_master'],
    sessions: [] as CompletedSession[],
  }
})

vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 0 }),
}))

vi.mock('@/hooks/useWaveform', () => ({
  useWaveform: () => ({ amplitude: 0.25 }),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/hooks/useWakeLock', () => ({
  useWakeLock: vi.fn(),
}))

vi.mock('@/hooks/useBreathingCycle', () => ({
  useBreathingCycle: (options: { onSessionComplete?: () => void }) => {
    mocks.cycleOptions = options
    return mocks.cycle
  },
}))

vi.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: () => ({
    addXP: mocks.addXP,
    unlockBadges: mocks.unlockBadges,
    recordSession: mocks.recordSession,
    earnedBadges: mocks.earnedBadges,
    selectedTheme: 'default',
    xp: 0,
  }),
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: mocks.sessions,
    getStreak: () => 0,
  }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({
    soundEnabled: false,
    soundVolume: 0,
  }),
}))

vi.mock('../SessionSummary', () => ({
  SessionSummary: ({
    isNewPersonalBest,
    newBadges,
  }: {
    isNewPersonalBest: boolean
    newBadges: string[]
  }) => (
    <div
      data-testid="session-summary"
      data-new-personal-best={String(isNewPersonalBest)}
      data-new-badges={newBadges.join(',')}
    />
  ),
}))

function createPriorSession(index: number): CompletedSession {
  return {
    id: `prior-${index}`,
    techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
    date: new Date(2026, 3, 1, 8, index % 60).toISOString(),
    durationSeconds: 16,
    rounds: 1,
    holdTimes: [30],
    maxHoldTime: 30,
    avgHoldTime: 30,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cycle.session = {
    config: sessionConfig,
    startTime,
    currentRound: 1,
    currentPhaseIndex: 1,
    currentPhase: BREATH_PHASES.HOLD_IN,
    timeRemaining: 0,
    isPaused: false,
    isComplete: true,
    holdTimes: [45],
  }
  mocks.sessions = [
    ...Array.from({ length: 98 }, (_, index) => createPriorSession(index)),
    {
      id: 'current-session-written-by-cycle',
      techniqueId: sessionConfig.techniqueId,
      date: startTime.toISOString(),
      durationSeconds,
      rounds: sessionConfig.rounds,
      holdTimes: [45],
      maxHoldTime: 45,
      avgHoldTime: 45,
    },
  ]
})

describe('BreathingSession summary context', () => {
  it('does not double-count the current history row when calculating badges and personal bests', async () => {
    render(<BreathingSession config={sessionConfig} />)

    act(() => {
      mocks.cycleOptions?.onSessionComplete?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('session-summary')).toHaveAttribute(
        'data-new-personal-best',
        'true'
      )
    })

    expect(mocks.unlockBadges).toHaveBeenCalledWith([])
    expect(mocks.unlockBadges).not.toHaveBeenCalledWith(expect.arrayContaining(['sessions_100']))
  })
})
