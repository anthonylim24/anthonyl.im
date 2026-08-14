import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import { OrbVisualization } from '../OrbVisualization'

const phases = [
  { phase: BREATH_PHASES.INHALE, seconds: 4 },
  { phase: BREATH_PHASES.EXHALE, seconds: 6 },
] as const

describe('OrbVisualization', () => {
  it('falls back to hairline rings when reduced motion is requested', () => {
    const { container } = render(
      <OrbVisualization
        phases={phases}
        phaseIndex={0}
        phaseSeconds={4}
        secondsLeftInPhase={3}
        status="running"
        colors={['#22624A', '#63B48E']}
        reducedMotion
      />,
    )

    expect(container.querySelector('[data-testid="orb-rings"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="glass-orb-canvas"]')).toBeNull()
  })
})
