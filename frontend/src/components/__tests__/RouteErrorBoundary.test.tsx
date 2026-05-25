import { lazy, Suspense } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '../RouteErrorBoundary'

function Bomb({ message = 'kaboom' }: { message?: string }): null {
  throw new Error(message)
}

describe('RouteErrorBoundary', () => {
  const originalLocation = window.location

  // The boundary intentionally calls console.error on catch — silence it in
  // tests so the suite output stays readable while still letting us assert
  // the spy fired.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    // Belt + suspenders: a failed assertion in the reload-button test would
    // skip its inline restore, leaving subsequent tests staring at a stubbed
    // `window.location`. Always reset here.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
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

  it('reload button calls window.location.reload', () => {
    const reloadSpy = vi.fn()
    // window.location.reload is read-only — replace the whole `location`
    // for the test, then restore in afterEach via vi.restoreAllMocks.
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload: reloadSpy },
    })

    render(
      <RouteErrorBoundary app="korea">
        <Bomb />
      </RouteErrorBoundary>,
    )

    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reloadSpy).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })

  it('catches a lazy chunk-load rejection when Suspense is nested INSIDE the boundary', async () => {
    // Simulates a failed dynamic import (e.g., a hashed asset that 404s
    // because the user is on a stale service-worker bundle). With Suspense
    // nested inside the boundary, the rejection propagates here instead of
    // crashing past every boundary above it.
    const Broken = lazy(() => Promise.reject(new Error('chunk load failed')))
    render(
      <RouteErrorBoundary app="korea">
        <Suspense fallback={<span>loading</span>}>
          <Broken />
        </Suspense>
      </RouteErrorBoundary>,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/Something went wrong loading the Korea itinerary\./),
      ).toBeTruthy()
    })
  })
})
