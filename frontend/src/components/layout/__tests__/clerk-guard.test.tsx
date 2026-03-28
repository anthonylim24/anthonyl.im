/**
 * Tests that components render without crashing when Clerk is not configured
 * (i.e., VITE_CLERK_PUBLISHABLE_KEY is not set and no ClerkProvider is present).
 *
 * This catches the class of errors where Clerk hooks like useAuth() are called
 * outside of <ClerkProvider>, which throws at runtime.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock CLERK_ENABLED to false — simulates no Clerk key in env
vi.mock('@/lib/clerk', () => ({ CLERK_ENABLED: false }))

// Mock Clerk React to prevent "must be inside ClerkProvider" errors
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => null,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () => null,
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  useSession: () => ({ session: null }),
}))

// Mock hooks used by BreathworkLayout that depend on browser APIs
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {} }) }))
vi.mock('@/hooks/useFavicon', () => ({ useFavicon: () => {} }))
vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 0 }),
}))

describe('Components render without ClerkProvider', () => {
  it('CLERK_ENABLED is false when mocked', async () => {
    const { CLERK_ENABLED } = await import('@/lib/clerk')
    expect(CLERK_ENABLED).toBe(false)
  })

  it('Header renders without crashing', async () => {
    const { Header } = await import('@/components/layout/Header')
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(container.querySelector('header')).toBeTruthy()
    // Auth controls should not be rendered when Clerk is disabled
    expect(screen.queryByText('Sign In')).toBeNull()
  })

  it('Settings renders without crashing', async () => {
    const { Settings } = await import('@/pages/Settings')
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )
    expect(screen.getByText('Settings')).toBeTruthy()
    // Account section should not be rendered when Clerk is disabled
    expect(screen.queryByText('Account')).toBeNull()
    expect(screen.queryByText('Sign in to sync')).toBeNull()
  })

  it('BreathworkLayout renders without crashing', async () => {
    const { BreathworkLayout } = await import('@/components/layout/BreathworkLayout')
    const { container } = render(
      <MemoryRouter>
        <BreathworkLayout />
      </MemoryRouter>,
    )
    expect(container.querySelector('.breathwork-layout')).toBeTruthy()
  })
})
