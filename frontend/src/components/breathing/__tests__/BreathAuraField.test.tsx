import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { AURA_NODE_COUNT, BreathAuraField } from '../BreathAuraField'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BreathAuraField', () => {
  it('renders ambient aura nodes and starts animation', () => {
    render(<BreathAuraField />)

    expect(screen.getByTestId('breath-aura-field')).toBeTruthy()
    expect(screen.getAllByTestId('breath-aura-node')).toHaveLength(AURA_NODE_COUNT)
    expect(vi.mocked(requestAnimationFrame)).toHaveBeenCalledTimes(1)
  })

  it('does not render or animate when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(<BreathAuraField />)

    expect(screen.queryByTestId('breath-aura-field')).toBeNull()
    expect(vi.mocked(requestAnimationFrame)).not.toHaveBeenCalled()
  })
})
