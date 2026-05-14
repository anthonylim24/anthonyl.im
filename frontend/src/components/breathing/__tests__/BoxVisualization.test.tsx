import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { BoxVisualization } from '../BoxVisualization'

const mocks = vi.hoisted(() => ({ reducedMotion: false }))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}))

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

describe('BoxVisualization', () => {
  beforeEach(() => {
    mocks.reducedMotion = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders all four sides with stable testids', () => {
    renderBox()
    expect(screen.getByTestId('box-visualization')).toBeInTheDocument()
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`box-side-${i}`)).toBeInTheDocument()
    }
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

  it('keeps not-yet-active sides collapsed at their start corner', () => {
    // phaseIndex 1 → sides 2 and 3 are pending. They render as a zero-length
    // line at their start corner with opacity 0.
    renderBox({ phaseIndex: 1, timeRemaining: 4 })
    for (const i of [2, 3]) {
      const side = screen.getByTestId(`box-side-${i}`)
      expect(side.getAttribute('x1')).toBe(side.getAttribute('x2'))
      expect(side.getAttribute('y1')).toBe(side.getAttribute('y2'))
      expect(side.style.opacity).toBe('0')
    }
  })

  it('extends earlier sides to their end corner when phaseIndex advances', () => {
    // phaseIndex 2 → sides 0 and 1 are complete: x2/y2 reach the end corner.
    renderBox({ phaseIndex: 2, timeRemaining: 4 })
    // Side 0: bottom-left (8,92) → top-left (8,8). When complete, x2=8, y2=8.
    const side0 = screen.getByTestId('box-side-0')
    expect(side0.getAttribute('x2')).toBe('8')
    expect(side0.getAttribute('y2')).toBe('8')
    // Side 1: top-left (8,8) → top-right (92,8). When complete, x2=92, y2=8.
    const side1 = screen.getByTestId('box-side-1')
    expect(side1.getAttribute('x2')).toBe('92')
    expect(side1.getAttribute('y2')).toBe('8')
  })

  it('renders a static, non-animated frame for reduced-motion users', () => {
    mocks.reducedMotion = true
    // Halfway through phase 0 — side 0 should be drawn to its midpoint.
    renderBox({ phaseIndex: 0, phaseDuration: 4, timeRemaining: 2 })
    const side0 = screen.getByTestId('box-side-0')
    // Side 0 goes (8,92) → (8,8). Midpoint y = 92 - 84*0.5 = 50.
    expect(side0.getAttribute('x2')).toBe('8')
    expect(Number(side0.getAttribute('y2'))).toBeCloseTo(50, 0)
  })

  it('drops light opacity when the session is paused', () => {
    renderBox({ isPaused: true, isActive: false })
    const light = screen.getByTestId('box-light')
    expect(Number(light.style.opacity)).toBeLessThan(1)
  })

  it('extends the active side endpoint as the phase progresses', async () => {
    // At t=0 of inhale: side 0 collapsed at the start corner (8,92).
    const { rerender } = renderBox({ phaseIndex: 0, phaseDuration: 4, timeRemaining: 4 })
    const side0Before = screen.getByTestId('box-side-0')
    expect(side0Before.getAttribute('y2')).toBe('92')

    // Halfway through: rerender with timeRemaining=2. discreteProgress=0.5
    // → snap forward via the catch-up effect, then the static-frame branch
    // (RAF mocked out by jsdom) renders y2 at the midpoint.
    mocks.reducedMotion = true
    rerender(
      <BoxVisualization
        phaseIndex={0}
        phaseDuration={4}
        timeRemaining={2}
        isActive
        isPaused={false}
        currentRound={0}
        ariaLabel="breathing visualization: Breathe In phase"
      />,
    )
    await act(async () => { /* flush effects */ })

    const side0After = screen.getByTestId('box-side-0')
    const y2 = Number(side0After.getAttribute('y2'))
    // y2 must move upward (smaller y) from 92 toward 8.
    expect(y2).toBeLessThan(92)
    expect(y2).toBeGreaterThanOrEqual(8)
  })
})
