import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Home } from '../Home'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  haptic: vi.fn(),
  sessions: [] as CompletedSession[],
  streak: 0,
  xp: 0,
  dailySessionCount: 0,
}))
const originalScrollIntoView = Element.prototype.scrollIntoView

vi.mock('@/hooks/useViewTransition', () => ({
  useViewTransitionNavigate: () => mocks.navigate,
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: mocks.sessions,
    getStreak: () => mocks.streak,
  }),
}))

vi.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: () => ({
    xp: mocks.xp,
    dailySessionCount: mocks.dailySessionCount,
  }),
}))

function renderHome() {
  render(<Home />)
}

beforeEach(() => {
  mocks.sessions = []
  mocks.streak = 0
  mocks.xp = 0
  mocks.dailySessionCount = 0
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })
  } else {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  }
})

describe('Home Protocol Lab', () => {
  it('starts the recommended calm protocol with computed rounds', async () => {
    const user = userEvent.setup()
    renderHome()

    expect(screen.getByRole('heading', { name: /protocol lab/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Calm' }))
    await user.click(screen.getByRole('button', { name: /Standard/ }))

    const startButton = screen.getByRole('button', {
      name: /Start Cyclic Sighing, .*30 rounds/i,
    })

    expect(startButton).toBeInTheDocument()

    await user.click(startButton)
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=cyclic_sighing&rounds=30'
    )
  })

  it('surfaces a safety-gated performance recommendation when selected', async () => {
    const user = userEvent.setup()
    renderHome()

    await user.click(screen.getByRole('button', { name: 'Perform' }))

    const startButton = screen.getByRole('button', {
      name: /Start CO2 Tolerance Table, .*7 rounds/i,
    })

    expect(startButton).toBeInTheDocument()
    expect(screen.getAllByText('Safety gated').length).toBeGreaterThan(0)

    await user.click(startButton)
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=co2_tolerance&rounds=7'
    )
  })

  it('keeps welcome secondary controls at 44px target height', () => {
    renderHome()

    for (const button of screen.getAllByRole('button', { name: /start your first session, .*rounds/i })) {
      expect(button).toHaveClass('min-h-11')
    }

    for (const button of screen.getAllByRole('button', { name: /browse all techniques/i })) {
      expect(button).toHaveClass('min-h-11')
    }
  })

  it('uses start-oriented labels for technique directory entries', () => {
    renderHome()

    expect(screen.getAllByRole('button', { name: /start box breathing/i }).length).toBeGreaterThan(0)
  })

  it('does not smooth scroll the welcome browse control for reduced-motion users', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))

    renderHome()

    await user.click(screen.getAllByRole('button', { name: /browse all techniques/i })[0])

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' })
  })

  it('replays recent sessions from the home shortcut', async () => {
    const user = userEvent.setup()
    mocks.sessions = [
      {
        id: 'session-1',
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        date: '2026-05-01T10:00:00.000Z',
        durationSeconds: 120,
        rounds: 3,
        customPhaseDurations: {
          [BREATH_PHASES.INHALE]: 6,
        },
        holdTimes: [],
        maxHoldTime: 0,
        avgHoldTime: 0,
      },
    ]

    renderHome()

    expect(screen.getByRole('button', { name: /view all sessions/i })).toHaveClass('min-h-11')

    const repeatButton = screen.getByRole('button', {
      name: /Repeat Box Breathing, 2 minutes, 3 rounds, custom cadence/i,
    })
    expect(repeatButton).toHaveClass('w-full')

    await user.click(repeatButton)

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=box_breathing&rounds=3&phase_inhale=6'
    )
  })

  it('signals safety checks before replaying advanced recent sessions', async () => {
    const user = userEvent.setup()
    mocks.sessions = [
      {
        id: 'session-advanced',
        techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
        date: '2026-05-01T10:00:00.000Z',
        durationSeconds: 185,
        rounds: 3,
        holdTimes: [25, 45],
        maxHoldTime: 45,
        avgHoldTime: 35,
      },
    ]

    renderHome()

    const repeatButton = screen.getByRole('button', {
      name: /Review safety check before repeating CO2 Tolerance Table, 3 minutes 5 seconds, 3 rounds/i,
    })
    expect(within(repeatButton).getByText(/safety check/i)).toBeInTheDocument()

    await user.click(repeatButton)

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=co2_tolerance&rounds=3'
    )
  })
})
