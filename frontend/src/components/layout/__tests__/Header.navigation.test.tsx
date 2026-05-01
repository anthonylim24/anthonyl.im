import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Header } from '../Header'

const { preloadBreathworkRoute } = vi.hoisted(() => ({
  preloadBreathworkRoute: vi.fn(),
}))

vi.mock('@/lib/clerk', () => ({
  CLERK_ENABLED: false,
}))

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: () => null,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

vi.mock('@/lib/breathworkRoutePreload', () => ({
  preloadBreathworkRoute,
}))

describe('Header navigation', () => {
  beforeEach(() => {
    preloadBreathworkRoute.mockClear()
  })

  it('marks the active desktop link as the current page', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/progress']}>
        <Header />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('preloads desktop nav routes on pointer intent and keyboard focus', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Header />
      </MemoryRouter>
    )

    const progressLink = screen.getByRole('link', { name: 'Progress' })

    await user.hover(progressLink)
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/progress')

    preloadBreathworkRoute.mockClear()

    progressLink.focus()
    expect(progressLink).toHaveFocus()
    expect(preloadBreathworkRoute).toHaveBeenCalledWith('/breathwork/progress')
  })
})
