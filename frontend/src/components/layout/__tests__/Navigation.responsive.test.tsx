import { useRef } from 'react'
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

vi.mock('@ybouane/liquidglass', () => ({
  // jsdom has no WebGL — `LiquidGlass.init` would throw in tests. The
  // component catches that and renders the fallback surface, but the
  // unhandled-rejection noise in test output is distracting. Mock it.
  LiquidGlass: {
    init: vi.fn(() => Promise.resolve({ destroy: vi.fn(), markChanged: vi.fn() })),
  },
}))

// Wrapper because Navigation now takes a `rootRef` prop that points at
// its LiquidGlass root element. In production BreathworkLayout owns
// that ref; here we synthesise one with `useRef` and render the host
// `<div>` alongside it.
function NavigationHost({ pathname }: { pathname: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <MemoryRouter initialEntries={[pathname]}>
      <div ref={rootRef}>
        <Navigation rootRef={rootRef} />
      </div>
    </MemoryRouter>
  )
}

describe('Navigation responsive behavior', () => {
  beforeEach(() => {
    preloadBreathworkRoute.mockClear()
  })

  it('floats the mobile nav as a glass capsule clear of the home indicator', () => {
    render(<NavigationHost pathname="/breathwork" />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toHaveClass('fixed', 'bottom-4', 'left-1/2', 'md:hidden', 'bw-mobile-nav')
  })

  it('keeps every mobile tab target at least 44px square', () => {
    render(<NavigationHost pathname="/breathwork" />)

    for (const label of ['Home', 'Breathe', 'Progress', 'Settings']) {
      const link = screen.getByRole('link', { name: label })
      expect(link).toHaveClass('h-11', 'w-11')
    }
  })

  it('marks the active mobile tab as the current page', () => {
    render(<NavigationHost pathname="/breathwork/progress" />)

    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('hides every nav surface on the active session route', () => {
    render(<NavigationHost pathname="/breathwork/session" />)

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renders a distinct desktop quick-launch dock alongside the mobile capsule', () => {
    render(<NavigationHost pathname="/breathwork" />)

    const desktopDock = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(desktopDock).toHaveClass('hidden', 'md:flex', 'right-8')
    expect(screen.getByRole('link', { name: /start a session/i })).toBeInTheDocument()
  })

  it('preloads mobile nav routes on pointer intent and keyboard focus', async () => {
    const user = userEvent.setup()

    render(<NavigationHost pathname="/breathwork" />)

    const settingsLink = screen.getByRole('link', { name: 'Settings' })

    await user.hover(settingsLink)
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/settings')

    preloadBreathworkRoute.mockClear()

    settingsLink.focus()
    expect(settingsLink).toHaveFocus()
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/settings')
  })
})
