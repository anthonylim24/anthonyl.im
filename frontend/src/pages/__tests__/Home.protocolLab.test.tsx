import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Home } from '../Home'
import { TECHNIQUE_IDS } from '@/lib/constants'
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

    expect(screen.getByRole('button', { name: /Start Cyclic Sighing/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Start Cyclic Sighing/i }))
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=cyclic_sighing&rounds=30'
    )
  })

  it('surfaces a safety-gated performance recommendation when selected', async () => {
    const user = userEvent.setup()
    renderHome()

    await user.click(screen.getByRole('button', { name: 'Perform' }))

    expect(screen.getByRole('button', { name: /Start CO2 Tolerance Table/i })).toBeInTheDocument()
    expect(screen.getAllByText('Safety gated').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Start CO2 Tolerance Table/i }))
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=co2_tolerance&rounds=7'
    )
  })

  it('keeps welcome secondary controls at 44px target height', () => {
    renderHome()

    for (const button of screen.getAllByRole('button', { name: /browse all techniques/i })) {
      expect(button).toHaveClass('min-h-11')
    }
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

  it('names the recent sessions shortcut and keeps it at 44px target height', () => {
    mocks.sessions = [
      {
        id: 'session-1',
        techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
        date: '2026-05-01T10:00:00.000Z',
        durationSeconds: 120,
        rounds: 3,
        holdTimes: [],
        maxHoldTime: 0,
        avgHoldTime: 0,
      },
    ]

    renderHome()

    expect(screen.getByRole('button', { name: /view all sessions/i })).toHaveClass('min-h-11')
  })
})
