import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BREATH_PHASES } from '@/lib/constants'
import { OrbVisualization } from '../OrbVisualization'

const useGlassOrb = vi.hoisted(() => vi.fn(() => false))

vi.mock('../useGlassOrb', () => ({
  useGlassOrb,
}))

vi.mock('../OrbParticleField', () => ({
  OrbParticleField: () => <canvas data-testid="orb-particle-field" />,
}))

const phases = [
  { phase: BREATH_PHASES.INHALE, seconds: 4 },
  { phase: BREATH_PHASES.EXHALE, seconds: 6 },
] as const

function renderOrb(reducedMotion: boolean) {
  return render(
    <OrbVisualization
      phases={phases}
      phaseIndex={0}
      phaseSeconds={4}
      secondsLeftInPhase={3}
      status="running"
      colors={['#22624A', '#63B48E']}
      reducedMotion={reducedMotion}
    />,
  )
}

describe('OrbVisualization', () => {
  it('falls back to hairline rings when reduced motion is requested', () => {
    useGlassOrb.mockReturnValue(false)
    const { container } = renderOrb(true)
    expect(container.querySelector('[data-testid="orb-rings"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="glass-orb-canvas"]')).toBeNull()
  })

  it('renders the glass canvas when WebGL is available', () => {
    useGlassOrb.mockReturnValue(false)
    const { container } = renderOrb(false)
    expect(container.querySelector('[data-testid="glass-orb-canvas"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="orb-particle-field"]')).toBeTruthy()
  })

  it('falls back to hairline rings when WebGL fails', () => {
    useGlassOrb.mockReturnValue(true)
    const { container } = renderOrb(false)
    expect(container.querySelector('[data-testid="orb-rings"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="glass-orb-canvas"]')).toBeNull()
  })
})
