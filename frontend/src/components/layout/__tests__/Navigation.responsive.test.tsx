import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from '../Navigation'

vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 24 }),
}))

describe('Navigation responsive behavior', () => {
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

  it('hides mobile nav on session route', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <Navigation />
      </MemoryRouter>
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
