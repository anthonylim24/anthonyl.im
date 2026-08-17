import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SiteNotFound } from '../pages/SiteNotFound'
import { KoreaNotFound } from '../pages/Korea/KoreaNotFound'
import { isMissingTripError, TripsNotFound } from '../pages/Trips/TripsNotFound'

describe('not-found pages', () => {
  it('offers a way back from unknown site routes', () => {
    render(
      <MemoryRouter>
        <SiteNotFound />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'This page is not here.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ask Anthony' })).toHaveAttribute('href', '/')
  })

  it('keeps unknown Korea routes inside the dossier', () => {
    render(
      <MemoryRouter>
        <KoreaNotFound />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'This page is not in the dossier.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to overview' })).toHaveAttribute('href', '/korea')
  })

  it('keeps unknown trip routes inside the planner', () => {
    render(
      <MemoryRouter>
        <TripsNotFound />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'This page is not on the itinerary.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All trips' })).toHaveAttribute('href', '/trips')
  })

  it('treats API trip-not-found as a missing document, not a network failure', () => {
    expect(isMissingTripError('trip not found')).toBe(true)
    expect(isMissingTripError('HTTP 502')).toBe(false)
  })
})
