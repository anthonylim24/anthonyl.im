import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BreathPatternStrip } from '../BreathPatternStrip'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { TECHNIQUE_IDS } from '@/lib/constants'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('uses a semantic token for phase dividers', () => {
    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]}
      />
    )

    expect(screen.getAllByTestId('breath-pattern-segment')[0].className).toContain(
      'border-[color:var(--bw-phase-divider)]'
    )
  })

  it('can render an animated cadence cursor using the cycle duration', () => {
    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]}
        animated
      />
    )

    expect(screen.getByTestId('breath-pattern-cursor')).toHaveStyle({
      animationDuration: '10s',
    })
  })

  it('does not render the cadence cursor for reduced-motion users', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))

    render(
      <BreathPatternStrip
        protocol={breathingProtocols[TECHNIQUE_IDS.RESONANCE_BREATHING]}
        animated
      />
    )

    expect(screen.queryByTestId('breath-pattern-cursor')).toBeNull()
  })
})
