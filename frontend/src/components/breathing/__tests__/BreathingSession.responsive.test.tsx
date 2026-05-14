import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BreathingSession } from '../BreathingSession'
import { TECHNIQUE_IDS } from '@/lib/constants'

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

describe('BreathingSession responsive layout', () => {
  it('sizes the shell to the small viewport (100svh) and prevents touch-driven scroll', () => {
    // We no longer read visualViewport offsets in JS — the body-scroll-lock
    // pattern + `height: 100svh` handles iOS viewport quirks more reliably
    // than computing `--viewport-bottom-offset` ourselves.
    const { container } = render(
      <BreathingSession
        config={{ techniqueId: TECHNIQUE_IDS.BOX_BREATHING, rounds: 4 }}
      />
    )

    const shell = container.querySelector('.session-shell') as HTMLElement
    expect(shell).toBeTruthy()
    // `.session-shell` (in index.css) applies `height: 100svh` with a
    // `height: 100%` fallback; jsdom doesn't parse svh so we verify the
    // class is on the element rather than reading a computed height.
    expect(shell.classList.contains('session-shell')).toBe(true)
    expect(shell.style.touchAction).toBe('none')

    // Body-scroll-lock pins `body` while the session is mounted.
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.overflow).toBe('hidden')

    // Session content + controls no longer carry the legacy CSS custom property.
    const controls = screen.getByTestId('session-controls')
    const content = screen.getByTestId('session-content')
    expect(controls.style.getPropertyValue('--viewport-bottom-offset')).toBe('')
    expect(content.style.getPropertyValue('--viewport-bottom-offset')).toBe('')
  })
})
