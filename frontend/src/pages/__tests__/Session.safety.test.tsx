import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: mocks.haptic }),
}))

vi.mock('@/hooks/useViewTransition', () => ({
  useViewTransitionNavigate: () => mocks.navigate,
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: () => ({
    sessions: mocks.sessions,
  }),
}))

vi.mock('@/components/breathing/BreathingSession', () => ({
  BreathingSession: ({ config }: { config: SessionConfig }) => (
    <div data-testid="active-session">
      {`${config.techniqueId}:${config.rounds}:${
        config.customPhaseDurations ? JSON.stringify(config.customPhaseDurations) : 'default'
      }`}
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

beforeEach(() => {
  mocks.sessions = []
})

afterEach(() => {
  vi.clearAllMocks()
  mocks.sessions = []
})

describe('Session safety gates', () => {
  it('blocks advanced protocols until the safety check is acknowledged', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.CO2_TOLERANCE}`)

    expect(screen.getAllByText('Safety check')).toHaveLength(2)
    expect(screen.getAllByText(/progressive breath holds/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Avoid or consult first')).toHaveLength(2)
    expect(screen.getAllByText(/pregnancy or with a history of seizures/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/cardiovascular disease, uncontrolled blood pressure/i).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { name: 'Hold ladder' })).toHaveLength(2)
    expect(screen.getAllByRole('img', {
      name: /round 1 15 seconds, round 2 20 seconds/,
    }).length).toBeGreaterThan(0)

    const beginButtons = screen.getAllByRole('button', { name: /^begin/i })
    for (const button of beginButtons) {
      expect(button).toBeDisabled()
    }
    expect(beginButtons[0].parentElement).toHaveClass('shrink-0', 'border-t')
    expect(beginButtons[1].parentElement).toHaveClass('shrink-0', 'border-t')
    expect(beginButtons[0].parentElement).not.toHaveClass('sticky')
    expect(beginButtons[1].parentElement).not.toHaveClass('sticky')
    expect(screen.getAllByText(/complete the safety check to begin/i)).toHaveLength(2)
    expect(beginButtons[0]).toHaveAccessibleDescription(/complete the safety check to begin/i)
    expect(beginButtons[1]).toHaveAccessibleDescription(/complete the safety check to begin/i)

    await user.click(beginButtons[1])
    expect(screen.queryByTestId('active-session')).not.toBeInTheDocument()

    const safetyCheckbox = screen.getAllByRole('checkbox', {
      name: /reviewed the cautions, am in a safe setting/i,
    })[0]
    expect(safetyCheckbox.getAttribute('aria-describedby')).toContain('contraindications')

    await user.click(safetyCheckbox)

    const enabledBeginButtons = screen.getAllByRole('button', { name: /^begin/i })
    for (const button of enabledBeginButtons) {
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAccessibleDescription(/complete the safety check to begin/i)
    }
    expect(screen.queryByText(/complete the safety check to begin/i)).not.toBeInTheDocument()

    await user.click(enabledBeginButtons[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.CO2_TOLERANCE}:8`
    )
  })

  it('blocks advanced protocols during the recovery window after a recent advanced set', async () => {
    const user = userEvent.setup()
    mocks.sessions = [
      {
        id: 'recent-power',
        techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
        date: new Date(Date.now() - 30_000).toISOString(),
        durationSeconds: 120,
        rounds: 30,
        holdTimes: [],
        maxHoldTime: 0,
        avgHoldTime: 0,
      },
    ]

    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.CO2_TOLERANCE}`)

    expect(screen.getAllByTestId('advanced-recovery-window')).toHaveLength(2)
    expect(screen.getAllByText(/wait .* after Power Breathing before another advanced set/i).length).toBeGreaterThan(0)

    const safetyCheckbox = screen.getAllByRole('checkbox', {
      name: /reviewed the cautions, am in a safe setting/i,
    })[0]
    await user.click(safetyCheckbox)

    const beginButtons = screen.getAllByRole('button', { name: /^begin/i })
    for (const button of beginButtons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(/recovery window active/i)
    }

    await user.click(beginButtons[1])
    expect(screen.queryByTestId('active-session')).not.toBeInTheDocument()
  })

  it('lets gentle protocols start without a safety acknowledgement', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}`)

    expect(screen.queryByText('Safety check')).not.toBeInTheDocument()
    expect(screen.getAllByRole('note', { name: /breathflow safety disclosure/i })).toHaveLength(2)
    expect(screen.getAllByText(/wellness education, not medical care/i)).toHaveLength(2)
    expect(screen.getAllByText(/cardiovascular, respiratory, neurological/i)).toHaveLength(2)

    const beginButtons = screen.getAllByRole('button', { name: /^begin/i })
    for (const button of beginButtons) {
      expect(button).not.toBeDisabled()
    }

    await user.click(beginButtons[1])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:30`
    )
  })

  it('surfaces mobile protocol cautions without opening science details', () => {
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.PURSED_LIP_RECOVERY}`)

    const mobileCaution = screen.getByTestId('mobile-protocol-caution')
    expect(within(mobileCaution).getByText('Caution')).toBeInTheDocument()
    expect(within(mobileCaution).getByText(/Seek medical care for chest pain/i)).toBeInTheDocument()
  })

  it('hydrates the round count from a valid recommendation link', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}&rounds=12`)

    await user.click(screen.getAllByRole('button', { name: /^begin/i })[0])
    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:12`
    )
  })

  it('keeps round controls aligned with protocol defaults above the base range', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.PURSED_LIP_RECOVERY}`)

    expect(screen.getAllByRole('group', { name: /session rounds, 50 selected/i }).length).toBeGreaterThan(0)

    for (const button of screen.getAllByRole('button', { name: /increase rounds/i })) {
      expect(button).toBeDisabled()
    }

    await user.click(screen.getAllByRole('button', { name: /decrease rounds/i })[0])
    expect(screen.getAllByRole('group', { name: /session rounds, 49 selected/i }).length).toBeGreaterThan(0)

    const increaseButtons = screen.getAllByRole('button', { name: /increase rounds/i })
    for (const button of increaseButtons) {
      expect(button).not.toBeDisabled()
    }

    await user.click(increaseButtons[0])
    await user.click(screen.getAllByRole('button', { name: /^begin/i })[0])

    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.PURSED_LIP_RECOVERY}:50`
    )
  })

  it('passes customized phase durations into the active session config', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}`)

    await user.click(screen.getAllByRole('button', {
      name: /Increase Breathe In duration, currently 5 seconds/i,
    })[0])

    expect(screen.getAllByRole('img', {
      name: /Breath pattern: Breathe In 6 seconds, Breathe Out 5 seconds/i,
    }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('5.5 bpm').length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /^begin/i })[0])

    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:30:{"inhale":6}`
    )
  })

  it('hydrates custom phase durations from replay links', async () => {
    const user = userEvent.setup()
    renderSession(
      `/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}&rounds=12&phase_inhale=6`
    )

    expect(screen.getAllByRole('img', {
      name: /Breath pattern: Breathe In 6 seconds, Breathe Out 5 seconds/i,
    }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('5.5 bpm').length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /^begin/i })[0])

    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:12:{"inhale":6}`
    )
  })

  it('names round controls and exposes selected technique state', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}&rounds=12`)

    expect(screen.getAllByRole('group', { name: /technique choices/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('group', { name: /session rounds, 12 selected/i }).length).toBeGreaterThan(0)

    const decreaseButtons = screen.getAllByRole('button', { name: /decrease rounds/i })
    const increaseButtons = screen.getAllByRole('button', { name: /increase rounds/i })

    expect(decreaseButtons.length).toBeGreaterThan(0)
    expect(increaseButtons.length).toBeGreaterThan(0)
    expect(decreaseButtons[0]).toHaveAccessibleName(/currently 12 rounds selected/i)
    expect(increaseButtons[0]).toHaveAccessibleName(/currently 12 rounds selected/i)
    expect(decreaseButtons[0]).toHaveClass('h-11', 'w-11')
    expect(increaseButtons[0]).toHaveClass('h-11', 'w-11')

    const selectedTechniqueButtons = screen.getAllByRole('button', {
      name: /resonance breathing/i,
    }).filter((button) => button.getAttribute('aria-pressed') === 'true')

    expect(selectedTechniqueButtons.length).toBeGreaterThan(0)
    expect(selectedTechniqueButtons[0]).toHaveClass('min-h-11')

    await user.click(decreaseButtons[0])
    expect(screen.getAllByRole('group', { name: /session rounds, 11 selected/i }).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: /^begin/i })[0])

    expect(screen.getByTestId('active-session')).toHaveTextContent(
      `${TECHNIQUE_IDS.RESONANCE_BREATHING}:11`
    )
  })

  it('exposes mobile setup navigation and science disclosure semantics', async () => {
    const user = userEvent.setup()
    renderSession(`/breathwork/session?technique=${TECHNIQUE_IDS.RESONANCE_BREATHING}`)

    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('min-h-11')

    const scienceToggle = screen.getByRole('button', { name: /how it works/i })
    expect(scienceToggle).toHaveClass('min-h-11')
    expect(scienceToggle).toHaveAttribute('aria-expanded', 'false')
    expect(scienceToggle).toHaveAttribute(
      'aria-controls',
      `mobile-science-panel-${TECHNIQUE_IDS.RESONANCE_BREATHING}`,
    )

    await user.click(scienceToggle)
    expect(scienceToggle).toHaveAttribute('aria-expanded', 'true')
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
