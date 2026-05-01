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
    <div data-testid="active-session">
      {config.techniqueId}:{config.rounds}
    </div>
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
      `${TECHNIQUE_IDS.CO2_TOLERANCE}:8`
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
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:30`
    )
  })

  it('hydrates the round count from a valid recommendation link', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}&rounds=12`)

    await user.click(screen.getAllByRole('button', { name: /begin/i })[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:12`
    )
  })

  it('names round controls and exposes selected technique state', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}&rounds=12`)

    const decreaseButtons = screen.getAllByRole('button', { name: /decrease rounds/i })
    const increaseButtons = screen.getAllByRole('button', { name: /increase rounds/i })

    expect(decreaseButtons.length).toBeGreaterThan(0)
    expect(increaseButtons.length).toBeGreaterThan(0)
    expect(decreaseButtons[0]).toHaveClass('h-11', 'w-11')
    expect(increaseButtons[0]).toHaveClass('h-11', 'w-11')

    const selectedTechniqueButtons = screen.getAllByRole('button', {
      name: /resonance breathing/i,
    }).filter((button) => button.getAttribute('aria-pressed') === 'true')

    expect(selectedTechniqueButtons.length).toBeGreaterThan(0)
    expect(selectedTechniqueButtons[0]).toHaveClass('min-h-11')

    await user.click(decreaseButtons[0])
    await user.click(screen.getAllByRole('button', { name: /begin/i })[0])

    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:11`
    )
  })

  it('renders source-level evidence links for the selected protocol', () => {
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.CYCLIC_SIGHING}`)

    expect(screen.getAllByText('Evidence Trail').length).toBeGreaterThan(0)

    const citationLinks = screen.getAllByRole('link', {
      name: /Brief structured respiration practices enhance mood/i,
    })

    expect(citationLinks.length).toBeGreaterThan(0)
    expect(citationLinks[0]).toHaveAttribute(
      'href',
      'https://doi.org/10.1016/j.xcrm.2022.100895'
    )
    expect(citationLinks[0]).toHaveAttribute('target', '_blank')
    expect(citationLinks[0]).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
