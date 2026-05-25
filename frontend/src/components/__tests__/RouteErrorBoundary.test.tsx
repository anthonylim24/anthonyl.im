import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '../RouteErrorBoundary'

function Bomb({ message = 'kaboom' }: { message?: string }): null {
  throw new Error(message)
}

describe('RouteErrorBoundary', () => {
  // The boundary intentionally calls console.error on catch — silence it in
  // tests so the suite output stays readable while still letting us assert
  // the spy fired.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when no error is thrown', () => {
    render(
      <RouteErrorBoundary app="korea">
        <p>itinerary</p>
      </RouteErrorBoundary>,
    )
    expect(screen.getByText('itinerary')).toBeTruthy()
  })

  it('renders the Korea recovery surface when a descendant throws', () => {
    render(
      <RouteErrorBoundary app="korea">
        <Bomb />
      </RouteErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(
      screen.getByText(/Something went wrong loading the Korea itinerary\./),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })

  it('picks the right heading per app variant', () => {
    render(
      <RouteErrorBoundary app="breathwork">
        <Bomb />
      </RouteErrorBoundary>,
    )
    expect(
      screen.getByText(/Something went wrong loading BreathFlow\./),
    ).toBeTruthy()
  })
})
