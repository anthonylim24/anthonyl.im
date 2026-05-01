import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Header } from '../Header'

vi.mock('@/lib/clerk', () => ({
  CLERK_ENABLED: false,
}))

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: () => null,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
}))

describe('Header navigation', () => {
  it('marks the active desktop link as the current page', () => {
    render(
      <MemoryRouter initialEntries={['/breathwork/progress']}>
        <Header />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})
