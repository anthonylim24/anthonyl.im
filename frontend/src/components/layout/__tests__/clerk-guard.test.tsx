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

// Verify CLERK_ENABLED is false in the test environment (no env var set)
import { CLERK_ENABLED } from '@/lib/clerk'

// Mock hooks used by BreathworkLayout that depend on browser APIs
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => {} }))
vi.mock('@/hooks/useFavicon', () => ({ useFavicon: () => {} }))
vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 0 }),
}))

describe('Components render without ClerkProvider', () => {
  it('CLERK_ENABLED is false when env var is not set', () => {
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
