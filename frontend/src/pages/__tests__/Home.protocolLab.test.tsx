import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Home } from '../Home'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  haptic: vi.fn(),
  sessions: [],
  streak: 0,
  xp: 0,
  dailySessionCount: 0,
}))

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
})
