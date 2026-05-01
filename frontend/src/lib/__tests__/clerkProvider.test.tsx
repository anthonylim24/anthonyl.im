import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.doUnmock('@/lib/clerk')
  vi.doUnmock('@clerk/clerk-react')
})

describe('createOptionalClerkTree', () => {
  it('does not import Clerk when no publishable key is configured', async () => {
    const clerkImport = vi.fn()

    vi.doMock('@/lib/clerk', () => ({
      CLERK_ENABLED: false,
      CLERK_PUBLISHABLE_KEY: '',
    }))
    vi.doMock('@clerk/clerk-react', () => {
      clerkImport()

      return {
        ClerkProvider: ({ children }: { children: ReactNode }) => (
          <div data-testid="clerk-provider">{children}</div>
        ),
      }
    })

    const { createOptionalClerkTree } = await import('../clerkProvider')
    const tree = await createOptionalClerkTree(<main>BreathFlow</main>)

    render(tree)

    expect(screen.getByText('BreathFlow')).toBeInTheDocument()
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument()
    expect(clerkImport).not.toHaveBeenCalled()
  })

  it('wraps the app in ClerkProvider when a publishable key is configured', async () => {
    vi.doMock('@/lib/clerk', () => ({
      CLERK_ENABLED: true,
      CLERK_PUBLISHABLE_KEY: 'pk_test_123',
    }))
    vi.doMock('@clerk/clerk-react', () => ({
      ClerkProvider: ({
        afterSignOutUrl,
        children,
        publishableKey,
      }: {
        afterSignOutUrl: string
        children: ReactNode
        publishableKey: string
      }) => (
        <div
          data-testid="clerk-provider"
          data-after-sign-out-url={afterSignOutUrl}
          data-publishable-key={publishableKey}
        >
          {children}
        </div>
      ),
    }))

    const { createOptionalClerkTree } = await import('../clerkProvider')
    const tree = await createOptionalClerkTree(<main>BreathFlow</main>)

    render(tree)

    const provider = screen.getByTestId('clerk-provider')
    expect(provider).toHaveAttribute('data-after-sign-out-url', '/breathwork')
    expect(provider).toHaveAttribute('data-publishable-key', 'pk_test_123')
    expect(screen.getByText('BreathFlow')).toBeInTheDocument()
  })
})
