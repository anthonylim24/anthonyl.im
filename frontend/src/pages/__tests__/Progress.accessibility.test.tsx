import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Progress } from '../Progress'

const mocks = vi.hoisted(() => ({
  clearHistory: vi.fn(),
  haptic: vi.fn(),
  history: {
    sessions: [],
    personalBests: {},
  },
  gamification: {
    xp: 0,
    earnedBadges: [],
  },
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    ...mocks.history,
    clearHistory: mocks.clearHistory,
  }),
}))

vi.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: () => mocks.gamification,
}))

vi.mock('@/components/tracking/ProgressChart', () => ({
  ProgressChart: () => <section aria-label="Progress chart" />,
}))

vi.mock('@/components/gamification/ActivityHeatmap', () => ({
  ActivityHeatmap: () => <section aria-label="Activity heatmap" />,
}))

vi.mock('@/components/gamification/BadgeGrid', () => ({
  BadgeGrid: () => <section aria-label="Achievements grid" />,
}))

vi.mock('@/components/tracking/PersonalBests', () => ({
  PersonalBests: () => <section aria-label="Personal bests" />,
}))

vi.mock('@/components/tracking/PracticeConsistency', () => ({
  PracticeConsistency: () => <section aria-label="Practice signal" />,
}))

function renderProgress() {
  render(
    <MemoryRouter>
      <Progress />
    </MemoryRouter>,
  )
}

describe('Progress accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.history.sessions = []
    mocks.history.personalBests = {}
    mocks.gamification.xp = 0
    mocks.gamification.earnedBadges = []
  })

  it('names the clear-history control and keeps confirmation targets large', async () => {
    const user = userEvent.setup()
    renderProgress()

    const clearButton = screen.getByRole('button', { name: /clear session history/i })
    expect(clearButton).toHaveClass('min-h-11', 'min-w-11')

    await user.click(clearButton)

    const confirmButton = screen.getByRole('button', { name: /confirm clear history/i })
    const cancelButton = screen.getByRole('button', { name: /cancel clear history/i })

    expect(screen.getByRole('status')).toHaveTextContent(/requires confirmation/i)
    expect(confirmButton).toHaveClass('min-h-11', 'min-w-11')
    expect(cancelButton).toHaveClass('min-h-11', 'min-w-11')

    await user.click(cancelButton)
    expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i)

    await user.click(screen.getByRole('button', { name: /clear session history/i }))
    await user.click(screen.getByRole('button', { name: /confirm clear history/i }))
    expect(mocks.clearHistory).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent(/history cleared/i)
  })

  it('keeps history filter controls and empty-history CTA at 44px height', () => {
    renderProgress()

    expect(screen.getByRole('region', { name: /practice signal/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show all sessions/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: /show box sessions/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: /start your first session/i })).toHaveClass('min-h-11')
  })

  it('exposes the selected history filter state to assistive technology', async () => {
    const user = userEvent.setup()
    renderProgress()

    const allFilter = screen.getByRole('button', { name: /show all sessions/i })
    const boxFilter = screen.getByRole('button', { name: /show box sessions/i })

    expect(screen.getByRole('group', { name: /session history filters/i })).toBeInTheDocument()
    expect(allFilter).toHaveAttribute('aria-pressed', 'true')
    expect(boxFilter).toHaveAttribute('aria-pressed', 'false')

    await user.click(boxFilter)

    expect(allFilter).toHaveAttribute('aria-pressed', 'false')
    expect(boxFilter).toHaveAttribute('aria-pressed', 'true')
  })
})
