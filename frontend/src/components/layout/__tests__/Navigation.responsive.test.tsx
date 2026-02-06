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

  it('hides mobile nav on session route', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <Navigation />
      </MemoryRouter>
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
