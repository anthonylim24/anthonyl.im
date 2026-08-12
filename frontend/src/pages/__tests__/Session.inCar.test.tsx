import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Session } from '../Session'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { SessionConfig } from '@/lib/breathingProtocols'
import type { CompletedSession } from '@/stores/historyStore'

const mocks = vi.hoisted(() => ({
  haptic: vi.fn(),
  navigate: vi.fn(),
  sessions: [] as CompletedSession[],
  inCar: false,
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/hooks/useViewTransition', () => ({
  useViewTransitionNavigate: () => mocks.navigate,
}))

vi.mock('@/hooks/useConstrainedViewport', () => ({
  useConstrainedViewport: () => mocks.inCar,
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: mocks.sessions,
  }),
}))

vi.mock('@/components/breathing/BreathingSession', () => ({
  BreathingSession: ({ config }: { config: SessionConfig }) => (
    <div data-testid="active-session">{config.techniqueId}</div>
  ),
}))

function renderSession(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Session />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.sessions = []
  mocks.inCar = true
})

afterEach(() => {
  vi.clearAllMocks()
  mocks.inCar = false
})

describe('Session in-car protocol block', () => {
  it('blocks advanced protocols in a vehicle browser and points to a gentle alternative', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.POWER_BREATHING}`)

    expect(screen.getAllByTestId('in-car-protocol-block')).toHaveLength(2)
    expect(screen.getAllByText(/not available while driving/i).length).toBeGreaterThan(0)

    const enterButtons = screen.getAllByRole('button', { name: /^(enter|begin)/i })
    for (const button of enterButtons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/not available while driving/i)
    }

    await user.click(enterButtons[0])
    expect(screen.queryByTestId('active-session')).not.toBeInTheDocument()
  })

  it('still allows cyclic sighing in a vehicle browser', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.CYCLIC_SIGHING}`)

    expect(screen.queryByTestId('in-car-protocol-block')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /^(enter|begin)/i })[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(TECHNIQUE_IDS.CYCLIC_SIGHING)
  })
})
