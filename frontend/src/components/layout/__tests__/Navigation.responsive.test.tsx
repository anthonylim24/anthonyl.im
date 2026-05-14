import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from '../Navigation'

const { preloadBreathworkRoute } = vi.hoisted(() => ({
  preloadBreathworkRoute: vi.fn(),
}))

vi.mock('@/lib/breathworkRoutePreload', () => ({
  preloadBreathworkRoute,
}))

describe('Navigation responsive behavior', () => {
  beforeEach(() => {
    preloadBreathworkRoute.mockClear()
  })

  it('anchors to the visual viewport bottom with safe-area padding for the home indicator', () => {
    // On iOS Safari 13+, position:fixed elements are positioned relative to
    // the visual viewport. The standard pattern is `bottom: 0` + a bottom
    // padding of `env(safe-area-inset-bottom)` so the buttons clear the
    // home indicator without computing a dynamic offset in JS (which
    // double-corrected on real devices and hid the nav below the fold).
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('fixed', 'bottom-0', 'bw-mobile-nav')
    // `.bw-mobile-nav` (in index.css) applies `padding-bottom: env(safe-area-
    // inset-bottom, 0px)` — jsdom can't compute env(), but the class
    // presence is the contract we care about.
    expect(nav.style.transform).toBe('translateZ(0)')
  })

  it('keeps every mobile tab target at least 44px square', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    for (const label of ['Home', 'Breathe', 'Progress', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  it('marks the active mobile tab as the current page', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/progress']}>
        <Navigation />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('hides mobile nav on session route', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <Navigation />
      </MemoryRouter>
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('preloads mobile nav routes on pointer intent and keyboard focus', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    const settingsLink = screen.getByRole('link', { name: 'Settings' })

    await user.hover(settingsLink)
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/settings')

    preloadBreathworkRoute.mockClear()

    settingsLink.focus()
    expect(settingsLink).toHaveFocus()
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/settings')
  })
})
