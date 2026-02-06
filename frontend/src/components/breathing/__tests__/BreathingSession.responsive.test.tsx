import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 18 }),
}))

vi.mock('@/hooks/useWaveform', () => ({
  useWaveform: () => ({ amplitude: 0.25 }),
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

describe('BreathingSession responsive layout', () => {
  it('applies viewport-aware bottom spacing for content and controls', () => {
    render(
      <BreathingSession
        config={{ techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }}
      />
    )

    const controls = screen.getByTestId('session-controls')
    const content = screen.getByTestId('session-content')

    expect(controls.style.getPropertyValue('--viewport-bottom-offset')).toBe('18px')
    expect(content.style.getPropertyValue('--viewport-bottom-offset')).toBe('18px')
  })
})
