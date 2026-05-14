import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { BoxVisualization } from '../BoxVisualization'

const mocks = vi.hoisted(() => ({ reducedMotion: false }))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}))

// jsdom doesn't implement SVG path geometry. Stub the methods BoxVisualization
// calls so getTotalLength() returns a deterministic length and
// getPointAtLength returns a sensible interpolated point.
const PATH_GEOMETRIC_LEN = 312
beforeEach(() => {
  SVGPathElement.prototype.getTotalLength = function getTotalLength() {
    return PATH_GEOMETRIC_LEN
  }
  SVGPathElement.prototype.getPointAtLength = function getPointAtLength(d: number) {
    return { x: d, y: d } as DOMPoint
  }
})

afterEach(() => {
  vi.useRealTimers()
})

function renderBox(overrides: Partial<React.ComponentProps<typeof BoxVisualization>> = {}) {
  return render(
    <BoxVisualization
      phaseIndex={0}
      phaseDuration={4}
      timeRemaining={4}
      isActive
      isPaused={false}
      currentRound={0}
      ariaLabel="breathing visualization: Breathe In phase"
      {...overrides}
    />
  )
}

function getOffset(node: Element): number {
  const style = (node as HTMLElement).style.strokeDashoffset
  return Number(style)
}

describe('BoxVisualization', () => {
  beforeEach(() => {
    mocks.reducedMotion = false
  })

  it('renders the base, glow, brass, and light layers', () => {
    renderBox()
    expect(screen.getByTestId('box-visualization')).toBeInTheDocument()
    expect(screen.getByTestId('box-base')).toBeInTheDocument()
    expect(screen.getByTestId('box-glow')).toBeInTheDocument()
    expect(screen.getByTestId('box-brass')).toBeInTheDocument()
    expect(screen.getByTestId('box-light')).toBeInTheDocument()
  })

  it('exposes the visualization as an image with an accessible label when not interactive', () => {
    renderBox({ ariaLabel: 'breathing visualization: Breathe Out phase' })
    expect(
      screen.getByRole('img', { name: /Breathe Out phase/i }),
    ).toBeInTheDocument()
  })

  it('wraps in a button with interactive label when onClick is provided', () => {
    renderBox({
      onClick: () => undefined,
      interactiveAriaLabel: 'toggle breathing visualization',
    })
    const button = screen.getByRole('button', { name: /toggle breathing visualization/i })
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe('BUTTON')
  })

  it('starts the brass fully retracted before the first phase', () => {
    // phaseIndex null = pre-session. Initial paint runs with progress=0 →
    // cumulative draw is 0, dashoffset = full path length (400).
    renderBox({ phaseIndex: null, timeRemaining: 4 })
    expect(getOffset(screen.getByTestId('box-brass'))).toBe(400)
    expect(getOffset(screen.getByTestId('box-glow'))).toBe(400)
  })

  it('renders the brass at the cumulative fill of the current phase under reduced motion', () => {
    mocks.reducedMotion = true
    // Halfway through phase 2 (exhale). cumulative = 2 * 100 + 0.5 * 100 = 250.
    // dashoffset = 400 - 250 = 150.
    renderBox({ phaseIndex: 2, phaseDuration: 4, timeRemaining: 2 })
    expect(getOffset(screen.getByTestId('box-brass'))).toBeCloseTo(150, 0)
  })

  it('renders a complete brass loop at the end of the final phase under reduced motion', () => {
    mocks.reducedMotion = true
    // End of phase 3 (hold-out). cumulative = 4 * 100 = 400 → dashoffset = 0.
    renderBox({ phaseIndex: 3, phaseDuration: 4, timeRemaining: 0 })
    expect(getOffset(screen.getByTestId('box-brass'))).toBeCloseTo(0, 0)
  })

  it('dims the traveling light when the session is paused', () => {
    renderBox({ isPaused: true, isActive: false })
    const light = screen.getByTestId('box-light')
    expect(Number((light as HTMLElement).style.opacity)).toBeLessThan(1)
  })

  it('omits the glow filter entirely under reduced motion', () => {
    mocks.reducedMotion = true
    renderBox({ phaseIndex: 0 })
    const glow = screen.getByTestId('box-glow')
    expect(glow.getAttribute('filter')).toBeFalsy()
  })

  it('applies themeColors to the brass primary color', () => {
    const themePrimary = '#3D9088'
    renderBox({ themeColors: [themePrimary, '#7AD0C6'] })
    // The light's bright center circle inherits the primary directly via fill.
    const lightGroup = screen.getByTestId('box-light')
    const brightCore = lightGroup.querySelector('circle:last-of-type')
    expect(brightCore?.getAttribute('fill')).toBe(themePrimary)
  })

  it('renders four phase-transition markers at the breath corners', () => {
    renderBox({ phaseIndex: 0 })
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`box-transition-${i}`)).toBeInTheDocument()
    }
  })

  it('brightens the upcoming transition marker as the current phase progresses', () => {
    mocks.reducedMotion = true
    // Near the end of phase 1 — the marker at the end of phase 1 (index 1)
    // should be substantially more opaque than the others.
    renderBox({ phaseIndex: 1, phaseDuration: 4, timeRemaining: 0.4 })
    const upcoming = screen.getByTestId('box-transition-1')
    const idle = screen.getByTestId('box-transition-3')
    const upcomingOpacity = Number((upcoming as HTMLElement).style.opacity)
    const idleOpacity = Number((idle as HTMLElement).style.opacity)
    expect(upcomingOpacity).toBeGreaterThan(idleOpacity)
    expect(upcomingOpacity).toBeGreaterThan(0.8)
  })
})
