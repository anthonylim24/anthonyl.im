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

vi.mock('@/hooks/useScrollMappedHide', () => ({
  // The scroll-mapping hook touches `window.scrollY` and DOM transforms;
  // we test its outputs in its own unit test. Stub it out here so the
  // responsive tests stay focused on layout contracts.
  useScrollMappedHide: vi.fn(),
}))

describe('Navigation responsive behavior', () => {
  beforeEach(() => {
    preloadBreathworkRoute.mockClear()
  })

  it('floats the mobile nav as a glass capsule clear of the home indicator', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // Floating: gapped from the viewport edge instead of flush, and
    // padded with the safe-area inset so it clears the home indicator
    // without having to compute a JS-side offset.
    expect(nav).toHaveClass('fixed', 'bottom-3', 'left-1/2', 'md:hidden', 'bw-mobile-nav')
  })

  it('keeps every mobile tab target at least 44px square', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    for (const label of ['Home', 'Breathe', 'Progress', 'Settings']) {
      const link = screen.getByRole('link', { name: label })
      expect(link).toHaveClass('h-11', 'w-11')
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

  it('hides every nav surface on the active session route', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <Navigation />
      </MemoryRouter>
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renders a distinct desktop quick-launch dock alongside the mobile capsule', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    // The desktop variant is a single CTA — different shape, different
    // anchor, different content from the mobile pill.
    const desktopDock = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(desktopDock).toHaveClass('hidden', 'md:block', 'right-8')
    expect(screen.getByRole('link', { name: /start a session/i })).toBeInTheDocument()
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
