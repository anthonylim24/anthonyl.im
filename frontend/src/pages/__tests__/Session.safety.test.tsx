import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Session } from '../Session'
import { TECHNIQUE_IDS } from '@/lib/constants'
import type { SessionConfig } from '@/lib/breathingProtocols'

const mocks = vi.hoisted(() => ({
  haptic: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/hooks/useViewTransition', () => ({
  useViewTransitionNavigate: () => mocks.navigate,
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
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Session safety gates', () => {
  it('blocks advanced protocols until the safety check is acknowledged', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.CO2_TOLERANCE}`)

    expect(screen.getAllByText('Safety check')).toHaveLength(2)
    expect(screen.getAllByText(/progressive breath holds/i).length).toBeGreaterThan(0)

    const beginButtons = screen.getAllByRole('button', { name: /begin/i })
    for (const button of beginButtons) {
      expect(button).toBeDisabled()
    }

    await user.click(beginButtons[0])
    expect(screen.queryByTestId('active-session')).not.toBeInTheDocument()

    await user.click(
      screen.getAllByRole('checkbox', {
        name: /safe setting and can stop immediately/i,
      })[0]
    )

    const enabledBeginButtons = screen.getAllByRole('button', { name: /begin/i })
    for (const button of enabledBeginButtons) {
      expect(button).not.toBeDisabled()
    }

    await user.click(enabledBeginButtons[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      TECHNIQUE_IDS.CO2_TOLERANCE
    )
  })

  it('lets gentle protocols start without a safety acknowledgement', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}`)

    expect(screen.queryByText('Safety check')).not.toBeInTheDocument()

    const beginButtons = screen.getAllByRole('button', { name: /begin/i })
    for (const button of beginButtons) {
      expect(button).not.toBeDisabled()
    }

    await user.click(beginButtons[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      TECHNIQUE_IDS.RESONANCE_BREATHING
    )
  })
})
