import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Header } from '../Header'

const { clerkState, preloadBreathworkRoute } = vi.hoisted(() => ({
  clerkState: { enabled: false },
  preloadBreathworkRoute: vi.fn(),
}))

vi.mock('@/lib/clerk', () => ({
  get CLERK_ENABLED() {
    return clerkState.enabled
  },
}))

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

vi.mock('@/lib/breathworkRoutePreload', () => ({
  preloadBreathworkRoute,
}))

describe('Header navigation', () => {
  beforeEach(() => {
    clerkState.enabled = false
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

  it('keeps desktop header links at 44px target height', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Header />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'BreathFlow' })).toHaveClass('min-h-11')
    for (const label of ['Home', 'Breathe', 'Progress', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toHaveClass('min-h-11')
    }
  })

  it('keeps the signed-out auth control at a 44px target size', () => {
    clerkState.enabled = true

    render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <Header />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveClass('min-h-11', 'min-w-11')
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
