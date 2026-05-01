import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from '../Navigation'

const { preloadBreathworkRoute } = vi.hoisted(() => ({
  preloadBreathworkRoute: vi.fn(),
}))

vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 24 }),
}))

vi.mock('@/lib/breathworkRoutePreload', () => ({
  preloadBreathworkRoute,
}))

describe('Navigation responsive behavior', () => {
  beforeEach(() => {
    preloadBreathworkRoute.mockClear()
  })

  it('applies dynamic bottom offset for mobile browser chrome', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Navigation />
      </MemoryRouter>
    )

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveStyle({ bottom: '24px' })
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
