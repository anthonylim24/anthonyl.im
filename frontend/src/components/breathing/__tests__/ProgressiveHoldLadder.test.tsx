import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressiveHoldLadder } from '../ProgressiveHoldLadder'
import { getProgressiveHoldDurations } from '../progressiveHold'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS } from '@/lib/constants'

describe('ProgressiveHoldLadder', () => {
  it('calculates increasing hold durations from the protocol table', () => {
    expect(
      getProgressiveHoldDurations(
        breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE],
        4,
      )
    ).toEqual([15, 20, 25, 30])
  })

  it('renders a labeled step for each progressive hold round', () => {
    render(
      <ProgressiveHoldLadder
        protocol={breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE]}
        rounds={4}
      />
    )

    expect(screen.getByRole('heading', { name: 'Hold ladder' })).toBeInTheDocument()
    expect(screen.getByRole('img', {
      name: /round 1 15 seconds, round 2 20 seconds, round 3 25 seconds, round 4 30 seconds/,
    })).toBeInTheDocument()
    expect(screen.getAllByTestId('progressive-hold-step')).toHaveLength(4)
    expect(screen.getByText('15s')).toBeInTheDocument()
    expect(screen.getByText('30s')).toBeInTheDocument()
  })

  it('does not render for non-progressive protocols', () => {
    const { container } = render(
      <ProgressiveHoldLadder
        protocol={breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]}
        rounds={4}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
