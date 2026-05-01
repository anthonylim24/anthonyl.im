import type { ReactElement, ReactNode } from 'react'
import { CLERK_PUBLISHABLE_KEY } from './clerk'

export async function createOptionalClerkTree(children: ReactNode): Promise<ReactElement> {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>
  }

  const { ClerkProvider } = await import('@clerk/clerk-react')

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/breathwork">
      {children}
    </ClerkProvider>
  )
}
