import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KirbyEasterEgg } from '../KirbyEasterEgg'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KirbyEasterEgg', () => {
  it('renders the overlay container', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg')).toBeTruthy()
  })

  it('overlay has pointer-events-none', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getByTestId('kirby-easter-egg').className).toContain('pointer-events-none')
  })

  it('renders 11 Kirby instances', () => {
    render(<KirbyEasterEgg />)
    expect(screen.getAllByTestId('kirby-instance')).toHaveLength(11)
  })
})
