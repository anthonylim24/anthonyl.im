import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BreathPatternStrip } from '../BreathPatternStrip'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS } from '@/lib/constants'

describe('BreathPatternStrip', () => {
  it('renders each protocol phase as an accessible timing strip', () => {
    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.CYCLIC_SIGHING]}
      />
    )

    expect(screen.getByRole('img', {
      name: /Breath pattern: Breathe In 3 seconds, Sip In 2 seconds, Breathe Out 5 seconds\./,
    })).toBeInTheDocument()
    expect(screen.getAllByTestId('breath-pattern-segment')).toHaveLength(3)
    expect(screen.getByText('Breathe In 3s')).toBeInTheDocument()
    expect(screen.getByText('Sip In 2s')).toBeInTheDocument()
    expect(screen.getByText('Breathe Out 5s')).toBeInTheDocument()
  })

  it('describes progressive hold protocols', () => {
    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.CO2_TOLERANCE]}
      />
    )

    expect(screen.getByRole('img', {
      name: /Hold increases by 5 seconds each round/,
    })).toBeInTheDocument()
    expect(screen.getByText('+5s hold each round')).toBeInTheDocument()
  })

  it('can render as compact visual-only timing context', () => {
    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]}
        compact
      />
    )

    expect(screen.getAllByTestId('breath-pattern-segment')).toHaveLength(2)
    expect(screen.queryByText('Breathe In 5s')).toBeNull()
  })
})
