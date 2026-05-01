import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SessionHistory } from '../SessionHistory'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import type { CompletedSession } from '@/stores/historyStore'

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

function session(overrides: Partial<CompletedSession>): CompletedSession {
  return {
    id: 'session-1',
    techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
    date: '2026-05-01T10:00:00.000Z',
    durationSeconds: 125,
    rounds: 4,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
    ...overrides,
  }
}

describe('SessionHistory', () => {
  it('keeps the empty-state CTA accessible and navigates to setup', async () => {
    const user = userEvent.setup()

    render(<SessionHistory sessions={[]} />)

    const startButton = screen.getByRole('button', { name: /start your first session/i })
    expect(startButton).toHaveClass('min-h-11')

    await user.click(startButton)
    expect(navigate).toHaveBeenCalledWith('/breathwork/session?technique=box_breathing')
  })

  it('renders completed sessions as a labeled list with full row summaries', () => {
    render(
      <SessionHistory
        sessions={[
          session({
            id: 'co2',
            techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
            durationSeconds: 185,
            rounds: 3,
            holdTimes: [25, 45],
            maxHoldTime: 45,
            avgHoldTime: 35,
          }),
          session({
            id: 'box',
            techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
            durationSeconds: 64,
            rounds: 4,
          }),
        ]}
      />
    )

    expect(screen.getByRole('list', { name: /2 completed sessions/i })).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: /CO2 Tolerance Table, May 1, 2026, 3 minutes 5 seconds, 3 rounds, best hold 45 seconds, average hold 35 seconds, safety check required before repeat/i,
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Safety check')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Review safety check before repeating CO2 Tolerance Table, 3 minutes 5 seconds, 3 rounds/i,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: /Box Breathing, May 1, 2026, 1 minute 4 seconds, 4 rounds/i,
      })
    ).toBeInTheDocument()
  })

  it('replays a completed session with rounds and custom cadence', async () => {
    const user = userEvent.setup()
    render(
      <SessionHistory
        sessions={[
          session({
            id: 'custom-resonance',
            techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
            durationSeconds: 330,
            rounds: 30,
            customPhaseDurations: {
              [BREATH_PHASES.INHALE]: 6,
              [BREATH_PHASES.EXHALE]: 5,
            },
          }),
        ]}
      />
    )

    const repeatButton = screen.getByRole('button', {
      name: /Repeat Resonance Breathing, 5 minutes 30 seconds, 30 rounds, custom cadence/i,
    })
    expect(repeatButton).toHaveClass('h-11', 'w-11')

    await user.click(repeatButton)

    expect(navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=resonance_breathing&rounds=30&phase_inhale=6&phase_exhale=5'
    )
  })

  it('routes advanced repeats through the safety-check setup path', async () => {
    const user = userEvent.setup()
    render(
      <SessionHistory
        sessions={[
          session({
            id: 'advanced-co2',
            techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
            durationSeconds: 185,
            rounds: 3,
            holdTimes: [25, 45],
            maxHoldTime: 45,
            avgHoldTime: 35,
          }),
        ]}
      />
    )

    await user.click(screen.getByRole('button', {
      name: /Review safety check before repeating CO2 Tolerance Table, 3 minutes 5 seconds, 3 rounds/i,
    }))

    expect(navigate).toHaveBeenCalledWith(
      '/breathwork/session?technique=co2_tolerance&rounds=3'
    )
  })
})
